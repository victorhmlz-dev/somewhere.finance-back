import { testDatabaseUrl } from './test-database.js';

const dev = 'postgresql://user:pass@localhost:5433/somewhere_finance';

describe('testDatabaseUrl', () => {
  it('adds "_test" to the database of DATABASE_URL', () => {
    expect(testDatabaseUrl({ DATABASE_URL: dev })).toBe(
      'postgresql://user:pass@localhost:5433/somewhere_finance_test',
    );
  });

  it('takes TEST_DATABASE_URL as it is', () => {
    const url = 'postgresql://user:pass@127.0.0.1:5432/other_test';
    expect(testDatabaseUrl({ DATABASE_URL: dev, TEST_DATABASE_URL: url })).toBe(
      url,
    );
  });

  it.each([
    ['a database not named "_test"', `${dev}`],
    [
      'a database on another machine',
      dev.replace('localhost', 'db.example.com') + '_test',
    ],
    ['a strange name', dev.replace('somewhere_finance', 'x";drop_test')],
  ])('refuses %s', (_case, url) => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow();
  });
});
