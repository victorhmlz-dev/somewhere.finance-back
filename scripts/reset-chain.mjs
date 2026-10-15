// Forgets the copy of one chain, so the indexer reads it again from its start
// block. Needed after restarting a local chain, which begins from zero while
// the database still remembers the old one. A new Launchpad contract does not
// need it: the indexer reads the new one on its own.
//
//   npm run launchpad:reset -- local
//
// It only deletes copies of chain data: launches, contributions, events, the
// assets each Launchpad allows and the indexer positions of that chain. What people added about the launches
// (descriptions and images, comments, reactions, notifications) is kept: a
// launch read again gets the same id, so all of it finds its launch again.
//
// A development tool: it refuses to run with NODE_ENV=production or on a
// database that is not on this machine, says what it will delete, and asks
// to type the chain key before doing it.
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function refuse(message) {
  console.error(message);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  refuse('launchpad:reset is for development and does not run in production.');
}

const chainKey = process.argv[2];
if (!chainKey) refuse('Usage: npm run launchpad:reset -- <chain key>');

// Only a database on this machine: a server's database is never reset by hand
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
if (!LOCAL_HOSTS.has(databaseUrl.hostname)) {
  refuse(
    `launchpad:reset only works on a database of this machine, not ${databaseUrl.hostname}.`,
  );
}

// Says what it will delete and asks to type the chain key to go on
const preview = new pg.Client({ connectionString: databaseUrl.toString() });
await preview.connect();
const counts = await preview.query(
  `SELECT
     (SELECT count(*) FROM launches WHERE chain_key = $1)::int AS launches,
     (SELECT count(*) FROM chain_events WHERE chain_key = $1)::int AS events`,
  [chainKey],
);
await preview.end();
const { launches: launchCount, events: eventCount } = counts.rows[0];
console.log(
  `Database "${databaseUrl.pathname.slice(1)}", chain "${chainKey}": ` +
    `${launchCount} launches and ${eventCount} events will be deleted and read again from the chain.`,
);
console.log(
  'Descriptions, images, comments, reactions and notifications are kept.',
);
const prompt = readline.createInterface({ input: stdin, output: stdout });
const answer = await prompt.question(`Type "${chainKey}" to go on: `);
prompt.close();
if (answer.trim() !== chainKey) refuse('Nothing was deleted.');

const client = new pg.Client({ connectionString: databaseUrl.toString() });
await client.connect();
try {
  await client.query('BEGIN');
  const launches = await client.query(
    'DELETE FROM launches WHERE chain_key = $1',
    [chainKey],
  );
  const events = await client.query(
    'DELETE FROM chain_events WHERE chain_key = $1',
    [chainKey],
  );
  await client.query('DELETE FROM chain_cursors WHERE chain_key = $1', [
    chainKey,
  ]);
  // Which assets each v3 Launchpad allows: read again from its events too
  await client.query(
    'DELETE FROM launchpad_quote_assets WHERE chain_key = $1',
    [chainKey],
  );
  await client.query('COMMIT');
  console.log(
    `Chain "${chainKey}": removed ${launches.rowCount} launches and ${events.rowCount} events.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
