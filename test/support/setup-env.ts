import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';
import { testDatabaseUrl } from './test-database.js';

// Runs in every test file before it imports the app, which reads its
// configuration from process.env first and from the .env file after.

// The test database, never the one of the .env
process.env.DATABASE_URL = testDatabaseUrl();
// Uploaded images go to a temporary folder, not to the real one
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'somewhere-test-uploads-'));
// Request limits are tested on their own; elsewhere they would get in the way
process.env.RATE_LIMIT_ENABLED = 'false';
