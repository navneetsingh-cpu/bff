import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Zone } from './zones';

export interface NavLinkProps {
  /** The zone this link points at. */
  targetZone: Zone;
  /** The zone doing the rendering. */
  currentZone: Zone;
  /** Absolute path on the public origin, e.g. `/connect`. */
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * A link that knows whether it is staying home or leaving the building.
 *
 * Within one zone, `next/link` is correct: the client router owns the
 * transition, no document request, no flash.
 *
 * Across zones it is flatly wrong. Each zone is a separate Next application in
 * a separate container, with its own router, its own build manifest and its own
 * basePath. A client-side transition from `/connect` to `/iif` asks the Connect
 * router for a route it has never heard of; the RSC fetch 404s against the
 * wrong basePath, and even if it resolved, the BFF would never see the request
 * and so would never mint an assertion for IIF.
 *
 * So a cross-zone link is a plain anchor, and the full document request that
 * follows is the point, not a regression: it goes through the BFF, which reads
 * the session and mints the assertion the destination requires.
 *
 * There is no `prefetch={false}` escape hatch here. The problem is not
 * prefetching, it is the client-side navigation itself.
 */
export function NavLink({ targetZone, currentZone, href, className, children }: NavLinkProps) {
  if (targetZone === currentZone) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
