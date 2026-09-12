import { Fragment } from 'react';
import { headers } from 'next/headers';
import { AUDIENCE, verifyRequestIdentity } from '@/lib/identity';
import { PERMISSIONS, can, getEntitlements } from '@/lib/entitlements';
import { EntitlementsProbe } from './entitlements-probe';

// Render on every request, never at build time. This page shows who is signed
// in, so a cached copy would leak one person's identity to the next visitor.
export const dynamic = 'force-dynamic';

// Stand-in for the real directory. Enough rows that connect.viewAll shows.
const DIRECTORY = [
  { userId: 'u-1001', name: 'Ada Lovelace', email: 'ada.lovelace@example.test', team: 'Engineering' },
  { userId: 'u-1002', name: 'Grace Hopper', email: 'grace.hopper@example.test', team: 'Engineering' },
  { userId: 'u-1003', name: 'Alan Turing', email: 'alan.turing@example.test', team: 'Research' },
];

// Who is calling? Only the BFF's signed assertion decides — never a cookie or
// an X-User-* header, which the caller could fake. The middleware already
// checked it; checking again is cheap and keeps this page safe on its own.
export default async function ConnectPage() {
  const result = await verifyRequestIdentity(headers());

  if (!result.ok) {
    // Unreachable — middleware 401s first. Here so no path renders unverified.
    return (
      <main>
        <h1>Unauthorized</h1>
        <p className="subtitle">No valid internal assertion on this request.</p>
      </main>
    );
  }

  const { identity, claims } = result;

  // Direct call, not HTTP — the route handler runs in this same process.
  const entitlements = await getEntitlements(claims);

  const canViewAll = can(entitlements, PERMISSIONS.viewAll);
  const canEditProfile = can(entitlements, PERMISSIONS.editProfile);

  // With viewAll, the whole directory. Without it, only your own row.
  const visiblePeople = canViewAll
    ? DIRECTORY
    : DIRECTORY.filter((person) => person.userId === identity.sub);

  return (
    <main>
      <p className="eyebrow">Sub-app · audience {AUDIENCE}</p>
      <h1>Connect</h1>
      <p className="subtitle">People and org directory.</p>

      <h2>Verified caller</h2>
      <div className="card">
        <dl>
          <dt>Subject</dt>
          <dd>{identity.sub}</dd>
          <dt>Name</dt>
          <dd>{identity.name || '—'}</dd>
          <dt>Email</dt>
          <dd>{identity.email}</dd>
          <dt>Roles</dt>
          <dd>{identity.roles.length > 0 ? identity.roles.join(', ') : '—'}</dd>
          <dt>Issuer</dt>
          <dd>{claims.iss}</dd>
          <dt>Audience</dt>
          <dd>{claims.aud}</dd>
          <dt>Expires</dt>
          <dd>{new Date(claims.exp * 1000).toISOString()}</dd>
          <dt>JWT id</dt>
          <dd>{claims.jti}</dd>
        </dl>
      </div>

      <h2>Entitlements</h2>
      <div className="card">
        <dl>
          <dt>Permissions</dt>
          <dd>{entitlements.permissions.length > 0 ? entitlements.permissions.join(', ') : '—'}</dd>
          <dt>Source</dt>
          <dd>{entitlements.source}</dd>
          <dt>Resolved</dt>
          <dd>{entitlements.resolvedAt}</dd>
        </dl>
      </div>

      <h2>{canViewAll ? 'Directory' : 'Your profile'}</h2>
      <p className="subtitle">
        {canViewAll
          ? `${PERMISSIONS.viewAll} is present — showing everyone.`
          : `${PERMISSIONS.viewAll} is absent — showing only your own record.`}
      </p>

      <div className="card">
        <dl>
          {visiblePeople.map((person) => (
            <Fragment key={person.userId}>
              <dt>{person.name}</dt>
              <dd>
                {person.email} · {person.team}
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>

      {/* Hiding the button is UX, not security — anyone can POST by hand.
          The real check must run server-side in the action itself. */}
      {canEditProfile && (
        <p>
          <button type="button" className="button">
            Edit profile
          </button>
        </p>
      )}

      <h2>Route check</h2>
      <p className="subtitle">
        The same data over HTTP, to show <code>/connect/api/entitlements</code> is live.
      </p>
      <EntitlementsProbe />

      <a className="back" href="/">
        ← Back to the BFF
      </a>
    </main>
  );
}
