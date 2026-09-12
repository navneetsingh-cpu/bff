import { LogoutButton } from '@bff/session-sync';
import { NavLink } from './nav-link';
import { PRODUCT_NAME, ZONES, type HeaderUser, type Zone } from './zones';

export interface AppHeaderProps {
  /** Which zone is rendering. Drives the active state — see below. */
  currentZone: Zone;
  /** Already-resolved user, or null when there is no session. */
  user?: HeaderUser | null;
  productName?: string;
}

/**
 * The header every zone renders. Deliberately plain: it exists to prove the
 * shared package resolves in dev and survives a standalone production build.
 *
 * Two rules hold it together:
 *
 * 1. **It never fetches.** Every app already knows who the caller is by the
 *    time it renders a layout — the BFF from its session, a sub-app from the
 *    verified assertion — so the user arrives as a prop. Fetching here would
 *    be a second source of truth for identity, one request behind the real
 *    one, and in a sub-app it would travel back through the proxy to answer a
 *    question the assertion already answered.
 *
 * 2. **Active state comes from `currentZone`, never `usePathname()`.** Inside
 *    a sub-app the basePath is stripped before the router sees the URL:
 *    Connect serving `/connect/teams` reports a pathname of `/teams`. Matching
 *    that against `/connect` fails, so the header would light up the wrong tab
 *    or none at all. The rendering app is the only thing that reliably knows
 *    which zone it is, so it says so explicitly.
 *
 * This is a server component — no state, no handlers. The only interactive
 * part is `LogoutButton`, which carries its own `'use client'`.
 */
export function AppHeader({ currentZone, user, productName = PRODUCT_NAME }: AppHeaderProps) {
  const displayName = user?.name || user?.email || null;

  return (
    <header className="app-header">
      <span className="app-header__title">{productName}</span>

      <nav aria-label="Zones" className="app-header__nav">
        {ZONES.map((zone) => (
          <NavLink
            key={zone.zone}
            targetZone={zone.zone}
            currentZone={currentZone}
            href={zone.href}
            className={zone.zone === currentZone ? 'is-active' : undefined}
          >
            {zone.label}
          </NavLink>
        ))}
      </nav>

      {displayName ? <span className="app-header__user">{displayName}</span> : null}
      <LogoutButton />
    </header>
  );
}
