import Redis from 'ioredis';
import { redisUrl } from './env';

/**
 * One connection per process, cached on globalThis so Next's dev-mode module
 * reloading doesn't leak a new client on every edit.
 */
declare global {
  // eslint-disable-next-line no-var
  var __bffRedis: Redis | undefined;
}

export function getRedis(): Redis {
  if (!globalThis.__bffRedis) {
    const client = new Redis(redisUrl(), {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    client.on('error', (error) => {
      // ioredis reconnects on its own; log rather than crash the server.
      console.error('[redis] connection error:', error.message);
    });

    globalThis.__bffRedis = client;
  }

  return globalThis.__bffRedis;
}
