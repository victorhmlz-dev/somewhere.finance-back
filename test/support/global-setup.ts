import { execSync } from 'node:child_process';
import 'dotenv/config';
import pg from 'pg';
import { testDatabaseUrl } from './test-database.js';

/**
 * Runs once before the e2e tests: creates the test database if it does not
 * exist and brings it to the latest migration. The database of the .env is
 * never touched.
 */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);

  // Connects to the server's default database to create the test one
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (exists.rowCount === 0) {
      // Only letters, digits and underscores (checked by testDatabaseUrl)
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
