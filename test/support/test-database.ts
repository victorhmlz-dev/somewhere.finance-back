/**
 * The database the e2e tests use: never the one of the .env, which is the
 * one people work with. TEST_DATABASE_URL names it; by default it is the
 * database of DATABASE_URL with "_test" added to its name.
 *
 * Tests delete what they create, and a bug in them could delete more, so
 * they refuse to run on a database whose name does not end in "_test" or
 * that is not on this machine.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL or TEST_DATABASE_URL');

  const url = new URL(base);
  if (!env.TEST_DATABASE_URL) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  }

  const name = url.pathname.slice(1);
  if (!/^[A-Za-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `The e2e tests only run on a database named like "something_test", not "${name}"`,
    );
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `The e2e tests only run on a database of this machine, not ${url.hostname}`,
    );
  }
  return url.toString();
}
