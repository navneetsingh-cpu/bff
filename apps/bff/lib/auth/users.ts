import type { NewSessionInput } from '../session';

/**
 * Seeded identities for AUTH_MODE=stub. Deliberately fake, deliberately
 * obvious — these exist so the handoff can be exercised without Entra.
 */
export const STUB_USERS: readonly NewSessionInput[] = [
  {
    userId: 'u-1001',
    email: 'ada.lovelace@example.test',
    name: 'Ada Lovelace',
    roles: ['employee', 'handbook.reader'],
  },
  {
    userId: 'u-1002',
    email: 'grace.hopper@example.test',
    name: 'Grace Hopper',
    roles: ['employee', 'iif.approver', 'handbook.reader'],
  },
  {
    userId: 'u-1003',
    email: 'alan.turing@example.test',
    name: 'Alan Turing',
    roles: ['employee', 'connect.admin', 'iif.approver', 'handbook.editor'],
  },
] as const;

export function findStubUser(userId: string | null | undefined): NewSessionInput | undefined {
  if (!userId) return undefined;
  return STUB_USERS.find((user) => user.userId === userId);
}
