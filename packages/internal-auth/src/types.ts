import { z } from 'zod'

/** Audience values: one per internal app. The BFF mints per-target tokens. */
export const InternalAudience = z.enum(['app-hr', 'app-ops'])
export type InternalAudience = z.infer<typeof InternalAudience>

export const INTERNAL_ASSERTION_HEADER = 'x-internal-assertion'
export const INTERNAL_ISSUER = 'bff'
export const ASSERTION_TTL_SECONDS = 60

/** The only identity contract between the BFF and the internal apps. */
export const InternalClaims = z.object({
  /** Entra ID subject (pairwise, per app registration). */
  sub: z.string().min(1),
  /** Entra ID object id (stable across apps in the tenant). */
  oid: z.string().min(1),
  roles: z.array(z.string()).default([]),
})
export type InternalClaims = z.infer<typeof InternalClaims>
