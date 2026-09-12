import { headers } from 'next/headers';
import { AUDIENCE, verifyRequestIdentity } from '@/lib/identity';

export const dynamic = 'force-dynamic';

/**
 * Verifies the assertion a second time rather than trusting a header the
 * middleware could have set. It's a few microseconds of HMAC, and it keeps the
 * rule absolute: identity comes from the signed assertion, nowhere else.
 */
export default async function HandbookPage() {
  const result = await verifyRequestIdentity(headers());

  if (!result.ok) {
    // Unreachable in practice — middleware already 401s. Here so the page never
    // has a code path that renders without a verified identity.
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
      <h1>Handbook</h1>
      <p className="subtitle">Policy documents.</p>

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

      <h2>Not built yet</h2>
      <ul className="stub">
        <li>Policy index by category, with search</li>
        <li>Versioned documents and effective dates</li>
        <li>Acknowledgement tracking per employee</li>
        <li>Draft and publish, gated on <code>handbook.editor</code></li>
      </ul>

      <a className="back" href="/">
        ← Back to the BFF
      </a>
    </main>
  );
}
