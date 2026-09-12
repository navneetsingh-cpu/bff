export {
  mintInternalAssertion,
  verifyInternalAssertion,
  type MintOptions,
  type VerifyOptions,
  type VerifyResult,
} from './assertion';

export {
  INTERNAL_ASSERTION_HEADER,
  DEFAULT_INTERNAL_ISSUER,
  DEFAULT_ASSERTION_TTL_SECONDS,
  DEFAULT_CLOCK_TOLERANCE_SECONDS,
  UNTRUSTED_HEADER_PREFIXES,
  isUntrustedHeader,
  stripUntrustedHeaders,
} from './constants';

export type {
  SessionRecord,
  VerifiedIdentity,
  InternalAssertionClaims,
  InternalAudience,
} from './types';
