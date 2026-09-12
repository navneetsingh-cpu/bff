'use client';

import { LOGOUT_PATH } from './contract';
import { broadcastLogout } from './use-logout';

export interface LogoutButtonProps {
  label?: string;
  className?: string;
}

/**
 * The sign-out button, shared by all four apps.
 *
 * A real `<form method="post">` rather than an onClick handler, for two
 * reasons: it satisfies the CSRF origin check without any extra plumbing, and
 * it still signs the user out if the page's JavaScript failed to load. In that
 * degraded case the only thing lost is the cross-tab broadcast — the server
 * still destroys the session.
 *
 * `onSubmit` does not call `preventDefault`. It broadcasts, then lets the
 * native submission proceed.
 */
export function LogoutButton({ label = 'Sign out', className = 'button' }: LogoutButtonProps) {
  return (
    <form method="post" action={LOGOUT_PATH} onSubmit={() => broadcastLogout()}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
