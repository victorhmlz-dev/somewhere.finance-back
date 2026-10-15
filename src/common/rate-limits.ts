import { Throttle } from '@nestjs/throttler';

export const MINUTE_MS = 60_000;

/**
 * Requests each IP can make per minute. Every route has the general limit;
 * the ones that cost more, or that are worth abusing, have a lower one.
 */
export const RATE_LIMITS = {
  general: 120,
  signIn: 10,
  uploads: 20,
  posts: 20,
  launchDetails: 10,
} as const;

/** Lowers the requests per minute and IP of a route below the general limit. */
export const LimitPerMinute = (limit: number) =>
  Throttle({ default: { limit, ttl: MINUTE_MS } });
