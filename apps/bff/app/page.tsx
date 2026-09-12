import { CurrentUser } from './current-user';

export const dynamic = 'force-dynamic';

const SUB_APPS = [
  { href: '/connect', label: 'Connect', blurb: 'People and org directory' },
  { href: '/iif', label: 'IIF', blurb: 'Intake form workflow' },
  { href: '/handbook', label: 'Handbook', blurb: 'Policy documents' },
];

export default function HomePage() {
  return (
    <main>
      <h1>BFF</h1>
      <p className="subtitle">
        One published port. The session lives here; the sub-apps only ever see a signed 60-second assertion.
      </p>

      <h2>Session</h2>
      <CurrentUser />

      <h2>Sub-apps</h2>
      <div className="apps">
        {SUB_APPS.map((app) => (
          <a key={app.href} href={app.href}>
            <strong>{app.label}</strong>
            <span>{app.blurb}</span>
          </a>
        ))}
      </div>
    </main>
  );
}
