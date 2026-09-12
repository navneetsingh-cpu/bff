import Redis from 'ioredis'
import { env } from './env'

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined
}

/** One shared connection; module state is re-created on dev hot reload. */
export function redis(): Redis {
  globalThis.__redis ??= new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  })
  return globalThis.__redis
}
