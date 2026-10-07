export interface Env {
  PORT: number;
  FRONT_URL: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN_SECONDS: number;
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

  return {
    PORT: port,
    FRONT_URL: frontUrl,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN_SECONDS: jwtExpiresIn,
  };
}
