import {
  ConfidentialClientApplication,
  CryptoProvider,
  type AuthenticationResult,
  type ICachePlugin,
} from '@azure/msal-node'
import { env, scopes } from './env'
import { updateSession, type Session, type SessionClaims } from './session'

const OIDC_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access'])

function privateKey(): string {
  return env().AZURE_CLIENT_CERT_PRIVATE_KEY.replace(/\n/g, '\n').trim()
}

/**
 * MSAL keeps its token cache in process memory, so every request builds a client
 * seeded from the session's decrypted cache blob and hands back the mutated
 * snapshot for re-encryption. Nothing is shared between sessions.
 */
export function msalForSession(initialCache = '') {
  let snapshot = initialCache

  const cachePlugin: ICachePlugin = {
    beforeCacheAccess: async (ctx) => {
      if (snapshot) ctx.tokenCache.deserialize(snapshot)
    },
    afterCacheAccess: async (ctx) => {
      if (ctx.cacheHasChanged) snapshot = ctx.tokenCache.serialize()
    },
  }

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: env().AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${env().AZURE_TENANT_ID}`,
      clientCertificate: {
        thumbprint: env().AZURE_CLIENT_CERT_THUMBPRINT,
        privateKey: privateKey(),
      },
    },
    cache: { cachePlugin },
  })

  return { cca, snapshot: () => snapshot }
}

export const cryptoProvider = new CryptoProvider()

export function resourceScopes(): string[] {
  const requested = scopes().filter((s) => !OIDC_SCOPES.has(s))
  return requested.length > 0 ? requested : ['openid', 'profile', 'offline_access']
}

/** Maps an MSAL result onto the minimal identity we keep server-side. */
export function claimsFromResult(result: AuthenticationResult): SessionClaims {
  const idClaims = (result.idTokenClaims ?? {}) as Record<string, unknown>
  return {
    sub: String(idClaims.sub ?? result.account?.homeAccountId ?? ''),
    oid: String(idClaims.oid ?? idClaims.sub ?? ''),
    roles: Array.isArray(idClaims.roles) ? idClaims.roles.map(String) : [],
    name: result.account?.name ?? (idClaims.name ? String(idClaims.name) : undefined),
    loginHint:
      result.account?.username ??
      (idClaims.preferred_username ? String(idClaims.preferred_username) : undefined),
  }
}

/**
 * Server-side silent refresh, used when a downstream app answers 401.
 * Returns the persisted session on success, null when re-authentication is required.
 */
export async function silentRefresh(session: Session): Promise<Session | null> {
  const { cca, snapshot } = msalForSession(session.tokenCache)
  const account = await cca.getTokenCache().getAccountByHomeId(session.homeAccountId)
  if (!account) return null

  try {
    const result = await cca.acquireTokenSilent({
      account,
      scopes: resourceScopes(),
      forceRefresh: true,
    })
    return await updateSession(session, {
      tokenCache: snapshot(),
      claims: { ...session.claims, ...claimsFromResult(result) },
    })
  } catch {
    return null
  }
}

/** Front-channel logout at the Entra end-session endpoint. */
export function endSessionUrl(loginHint?: string): string {
  const url = new URL(
    `https://login.microsoftonline.com/${env().AZURE_TENANT_ID}/oauth2/v2.0/logout`,
  )
  url.searchParams.set('post_logout_redirect_uri', env().POST_LOGOUT_REDIRECT_URI)
  if (loginHint) url.searchParams.set('logout_hint', loginHint)
  return url.toString()
}
