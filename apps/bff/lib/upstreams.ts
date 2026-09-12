import type { InternalAudience } from '@bff/internal-auth';

export interface Upstream {
  /** Container-network origin. Never published to the host. */
  origin: string;
  /** The sub-app's Next.js basePath. Also the path prefix the BFF owns. */
  basePath: string;
  label: string;
  blurb: string;
}

/**
 * The single source of truth for where each sub-app lives. The catch-all proxy
 * route handlers and the home page links both read from here.
 */
export function upstreamFor(audience: InternalAudience): Upstream {
  switch (audience) {
    case 'connect':
      return {
        origin: process.env.CONNECT_ORIGIN ?? 'http://connect:3000',
        basePath: '/connect',
        label: 'Connect',
        blurb: 'People and org directory',
      };
    case 'iif':
      return {
        origin: process.env.IIF_ORIGIN ?? 'http://iif:3000',
        basePath: '/iif',
        label: 'IIF',
        blurb: 'Intake form workflow',
      };
    case 'handbook':
      return {
        origin: process.env.HANDBOOK_ORIGIN ?? 'http://handbook:3000',
        basePath: '/handbook',
        label: 'Handbook',
        blurb: 'Policy documents',
      };
  }
}

export const ALL_AUDIENCES: InternalAudience[] = ['connect', 'iif', 'handbook'];
