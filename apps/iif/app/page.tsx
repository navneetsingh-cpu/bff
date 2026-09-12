import { headers } from 'next/headers';
import { AUDIENCE, verifyRequestIdentity } from '@/lib/identity';

// Render on every request, never at build time. This page shows who is signed
// in, so a cached copy would leak one person's identity to the next visitor.
export const dynamic = 'force-dynamic';

// Who is calling? Only the BFF's signed assertion decides — never a cookie or
// an X-User-* header, which the caller could fake. The middleware already
// checked it; checking again is cheap and keeps this page safe on its own.
export default async function IifPage() {
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

  return (
    <main>
      <p className="eyebrow">Sub-app · audience {AUDIENCE}</p>
      <h1>IIF</h1>
      <p className="subtitle">Intake form workflow.</p>

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

      <a className="back" href="/">
        ← Back to the BFF
      </a>
    </main>
  );
}
