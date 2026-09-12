'use client';

import { useEffect, useState } from 'react';
import { LogoutButton } from '@bff/session-sync';

interface MeResponse {
  authenticated: boolean;
  authMode: 'stub' | 'oidc';
  user?: { userId: string; email: string; name: string; roles: string[] };
  session?: { createdAt: string; lastSeenAt: string };
}

type State = { status: 'loading' } | { status: 'ready'; me: MeResponse } | { status: 'error'; message: string };

/**
 * Reads identity from /api/auth/me rather than from a server render, so the
 * page doubles as a live check that the session endpoint works end to end.
 */
export function CurrentUser() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`/api/auth/me returned ${res.status}`);
        return res.json() as Promise<MeResponse>;
      })
      .then((me) => {
        if (!cancelled) setState({ status: 'ready', me });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Request failed' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <div className="card">Checking session…</div>;
  }

  if (state.status === 'error') {
    return <div className="card">Could not reach /api/auth/me — {state.message}</div>;
  }

  const { me } = state;

  if (!me.authenticated) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>Not signed in.</p>
        <div className="actions">
          <a className="button" href="/api/auth/login">
            Sign in
          </a>
          <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
            AUTH_MODE=<code>{me.authMode}</code>
          </span>
        </div>
      </div>
    );
  }

  const user = me.user!;

  return (
    <div className="card">
      <dl>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>User id</dt>
        <dd>{user.userId}</dd>
        <dt>Roles</dt>
        <dd>{user.roles.length > 0 ? user.roles.join(', ') : '—'}</dd>
        <dt>Signed in</dt>
        <dd>{me.session ? new Date(me.session.createdAt).toLocaleString() : '—'}</dd>
      </dl>
      <div className="actions">
        <LogoutButton />
        <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
          AUTH_MODE=<code>{me.authMode}</code>
        </span>
      </div>
    </div>
  );
}
