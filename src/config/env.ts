import { type ChainConfig, parseChains } from './chains.js';

export interface Env {
  PORT: number;
  FRONT_URL: string;
  /** Address the API is reached at from outside, e.g. in links to uploads. */
  PUBLIC_API_URL: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN_SECONDS: number;
  /** The networks Somewhere works with, of every family. Empty for none. */
  CHAINS: ChainConfig[];
  /** How often each chain is checked for new blocks. */
  INDEXER_POLL_MS: number;
  /** Folder uploaded images are kept in. */
  UPLOAD_DIR: string;
  /** Images a user can upload in 24 hours. */
  UPLOAD_DAILY_LIMIT: number;
  /** Whether requests per IP are limited. Off only in tests. */
  RATE_LIMIT_ENABLED: boolean;
  /**
   * How many proxies (load balancer, CDN) sit in front of the API. With 0
   * the address that connects is the client's; behind a proxy, the client's
   * address is read from X-Forwarded-For, skipping that many hops.
   */
  TRUST_PROXY: number;
  /**
   * The Privy app whose identity tokens sign users in (public, the same the
   * front uses). Null to sign in only with a wallet signature.
   */
  PRIVY_APP_ID: string | null;
}

const ONE_WEEK_IN_SECONDS = 60 * 60 * 24 * 7;

// Runs once at startup, so a missing or malformed variable stops the app
// before it accepts any request.
export function validateEnv(raw: Record<string, unknown>): Env {
  const port = Number(raw.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `PORT must be a valid port number, got "${String(raw.PORT)}"`,
    );
  }

  const databaseUrl = raw.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('postgres')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  const frontUrl = raw.FRONT_URL ?? 'http://localhost:3000';
  if (typeof frontUrl !== 'string' || !URL.canParse(frontUrl)) {
    throw new Error('FRONT_URL must be a valid URL');
  }

  const publicApiUrl = String(
    raw.PUBLIC_API_URL ?? `http://localhost:${port}/api`,
  ).replace(/\/+$/, '');
  if (!URL.canParse(publicApiUrl)) {
    throw new Error('PUBLIC_API_URL must be a valid URL');
  }

  const uploadDir = raw.UPLOAD_DIR ?? 'uploads';
  if (typeof uploadDir !== 'string' || uploadDir.trim() === '') {
    throw new Error('UPLOAD_DIR must be a folder');
  }

  const uploadDailyLimit = Number(raw.UPLOAD_DAILY_LIMIT ?? 30);
  if (!Number.isInteger(uploadDailyLimit) || uploadDailyLimit < 1) {
    throw new Error('UPLOAD_DAILY_LIMIT must be an integer of at least 1');
  }

  const rateLimit = String(raw.RATE_LIMIT_ENABLED ?? 'true');
  if (rateLimit !== 'true' && rateLimit !== 'false') {
    throw new Error('RATE_LIMIT_ENABLED must be true or false');
  }

  const trustProxy = Number(raw.TRUST_PROXY ?? 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0) {
    throw new Error('TRUST_PROXY must be the number of proxies, 0 or more');
  }

  const jwtSecret = raw.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  const jwtExpiresIn = Number(
    raw.JWT_EXPIRES_IN_SECONDS ?? ONE_WEEK_IN_SECONDS,
  );
  if (!Number.isInteger(jwtExpiresIn) || jwtExpiresIn < 60) {
    throw new Error('JWT_EXPIRES_IN_SECONDS must be an integer of at least 60');
  }

  const indexerPollMs = Number(raw.INDEXER_POLL_MS ?? 4000);
  if (!Number.isInteger(indexerPollMs) || indexerPollMs < 250) {
    throw new Error('INDEXER_POLL_MS must be an integer of at least 250');
  }

  return {
    PORT: port,
    FRONT_URL: frontUrl,
    PUBLIC_API_URL: publicApiUrl,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN_SECONDS: jwtExpiresIn,
    CHAINS: parseChains(raw.CHAINS, raw.EVM_CHAINS),
    INDEXER_POLL_MS: indexerPollMs,
    UPLOAD_DIR: uploadDir,
    UPLOAD_DAILY_LIMIT: uploadDailyLimit,
    RATE_LIMIT_ENABLED: rateLimit === 'true',
    TRUST_PROXY: trustProxy,
    PRIVY_APP_ID:
      typeof raw.PRIVY_APP_ID === 'string' && raw.PRIVY_APP_ID.trim()
        ? raw.PRIVY_APP_ID.trim()
        : null,
  };
}
