import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from 'jose'
import {
  ASSERTION_TTL_SECONDS,
  INTERNAL_ASSERTION_HEADER,
  INTERNAL_ISSUER,
  InternalAudience,
  InternalClaims,
} from './types'

export * from './types'

const ALG = 'EdDSA'

/**
 * PEM values arrive from env with literal "\n" sequences (docker/.env friendly).
 * Keys are resolved lazily so the Edge-runtime middleware in the sub-apps reads
 * them at request time rather than at build time.
 */
function pem(name: string): string {
  const raw = process.env[name]
  if (!raw) throw new Error(`${name} is not set`)
  return raw.replace(/\n/g, '\n').trim()
}

let privateKey: Promise<KeyLike> | undefined
let publicKey: Promise<KeyLike> | undefined

function getPrivateKey() {
  privateKey ??= importPKCS8(pem('INTERNAL_JWT_PRIVATE_KEY'), ALG)
  return privateKey
}

function getPublicKey() {
  publicKey ??= importSPKI(pem('INTERNAL_JWT_PUBLIC_KEY'), ALG)
  return publicKey
}

/** BFF side: mint a short-lived, audience-bound assertion for one downstream app. */
export async function mintInternalAssertion(
  claims: InternalClaims,
  audience: InternalAudience,
): Promise<string> {
  const payload = InternalClaims.parse(claims)
  return new SignJWT({ oid: payload.oid, roles: payload.roles })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuer(INTERNAL_ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${ASSERTION_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(await getPrivateKey())
}

/** Sub-app side: verify signature, issuer, audience and expiry. Throws on failure. */
export async function verifyInternalAssertion(
  token: string,
  audience: InternalAudience,
): Promise<InternalClaims> {
  const { payload } = await jwtVerify(token, await getPublicKey(), {
    algorithms: [ALG],
    issuer: INTERNAL_ISSUER,
    audience,
    clockTolerance: 5,
    maxTokenAge: `${ASSERTION_TTL_SECONDS}s`,
  })
  return InternalClaims.parse({
    sub: payload.sub,
    oid: payload.oid,
    roles: payload.roles ?? [],
  })
}

/** Read the assertion out of a request, returning null when absent. */
export function readAssertionHeader(headers: Headers): string | null {
  return headers.get(INTERNAL_ASSERTION_HEADER)
}
