/**
 * The four zones behind the BFF, and the one place their labels and hrefs are
 * written down.
 *
 * Hrefs are absolute paths on the *public* origin, not on any sub-app's
 * basePath. `/connect` is what the browser asks the BFF for; the sub-app then
 * serves it under its own basePath. Anything relative here would be resolved
 * against the current sub-app's basePath and point at the wrong place.
 */

export type Zone = 'home' | 'connect' | 'iif' | 'handbook';

export interface ZoneDescriptor {
  zone: Zone;
  href: string;
  label: string;
}

export const PRODUCT_NAME = 'BFF';

export const ZONES: readonly ZoneDescriptor[] = [
  { zone: 'home', href: '/', label: 'Home' },
  { zone: 'connect', href: '/connect', label: 'Connect' },
  { zone: 'iif', href: '/iif', label: 'IIF' },
  { zone: 'handbook', href: '/handbook', label: 'Handbook' },
];

/** The subset of a user the header renders. Deliberately tiny — see AppHeader. */
export interface HeaderUser {
  name?: string | null;
  email?: string | null;
}
