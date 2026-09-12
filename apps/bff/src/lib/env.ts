import { z } from 'zod'

const Env = z.object({
  AZURE_TENANT_ID: z.string().min(1),
  AZURE_CLIENT_ID: z.string().min(1),
  AZURE_CLIENT_CERT_PRIVATE_KEY: z.string().min(1),
  AZURE_CLIENT_CERT_THUMBPRINT: z.string().min(1),
  AZURE_SCOPES: z.string().default('openid profile offline_access'),

  BFF_PUBLIC_ORIGIN: z.string().url(),
  REDIRECT_URI: z.string().url(),
  POST_LOGOUT_REDIRECT_URI: z.string().url(),

  REDIS_URL: z.string().min(1),
  SESSION_ENC_KEY: z.string().min(1),
  SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(28800),

  SPA_BASE_URL: z.string().url().optional(),
  DEV_INSECURE_COOKIE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

let cached: z.infer<typeof Env> | undefined

export function env() {
  if (!cached) {
    const parsed = Env.safeParse(process.env)
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
    }
    cached = parsed.data
  }
  return cached
}

export const scopes = () => env().AZURE_SCOPES.split(/\s+/).filter(Boolean)
