import { LOGIN_PATH } from '@bff/session-sync/contract';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Signed out',
};

/**
 * The landing spot after sign-out.
 *
 * Deliberately does no session lookup, touches no Redis, and reads no cookie.
 * It has to render for someone who has *just* had their session destroyed, and
 * for a tab that was redirected here by a sign-out in a different tab. Anything
 * that could fail or redirect would strand those users.
 *
 * It also has to be safe to land on from Entra's front-channel logout, which
 * arrives as a plain cross-site GET with no session.
 */
export default function LoggedOutPage() {
  return (
    <main>
      <h1>Signed out</h1>
      <p className="subtitle">
        Your session has been destroyed on the server and this browser has been asked to clear its
        cookies and stored data for this site.
      </p>

      <div className="card">
        <p style={{ margin: 0 }}>Any other tabs you had open have been signed out too.</p>
        <div className="actions">
          {/* A plain anchor, not next/link: this is a full page load into a
              route handler, and a soft navigation would skip it. */}
          <a className="button" href={LOGIN_PATH}>
            Sign in again
          </a>
        </div>
      </div>
    </main>
  );
}
