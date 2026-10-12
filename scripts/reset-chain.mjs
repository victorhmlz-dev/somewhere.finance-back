// Forgets everything indexed from one chain, so the indexer reads it again
// from its start block. Needed after restarting a local chain, which begins
// from zero while the database still remembers the old one.
//
//   npm run launchpad:reset -- local
//
// It only deletes copies of chain data (launches, contributions, events and
// the indexer position of that chain). Descriptions and images that creators
// added to those launches through the API are lost with them.
import 'dotenv/config';
import pg from 'pg';

const chainKey = process.argv[2];
if (!chainKey) {
  console.error('Usage: npm run launchpad:reset -- <chain key>');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
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
