/**
 * Only ever redirect to a path on this origin. `//evil.example` and
 * `https://evil.example` are both rejected — an open redirect on the login
 * endpoint is a phishing primitive.
 */
export function safeReturnTo(candidate: string | null | undefined, fallback = '/'): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//')) return fallback;
  if (candidate.startsWith('/\\')) return fallback;
  return candidate;
}
