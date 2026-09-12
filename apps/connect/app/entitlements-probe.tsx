'use client';

import { useState } from 'react';

/**
 * A button that calls the entitlements route from the browser and prints what
 * came back.
 *
 * The page itself does not need this — it calls `getEntitlements` directly on
 * the server. This exists so the HTTP route is demonstrably live: the request
 * leaves the browser, passes through the BFF, gets a freshly minted assertion,
 * and comes back as JSON.
 */
export function EntitlementsProbe() {
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function probe() {
    setLoading(true);
    try {
      // Absolute path including the basePath. A relative 'api/entitlements'
      // would resolve against the current URL and break on any nested route.
      const response = await fetch('/connect/api/entitlements', {
        headers: { accept: 'application/json' },
        // The BFF needs the session cookie to mint an assertion for this call.
        credentials: 'same-origin',
      });

      const body = await response.text();
      setOutput(`${response.status} ${response.statusText}\n\n${body}`);
    } catch (error) {
      setOutput(error instanceof Error ? error.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className="button" onClick={probe} disabled={loading}>
        {loading ? 'Fetching…' : 'GET /connect/api/entitlements'}
      </button>

      {output !== null && (
        <pre className="card probe-output">
          <code>{output}</code>
        </pre>
      )}
    </div>
  );
}
