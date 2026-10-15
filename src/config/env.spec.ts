import { validateEnv } from './env.js';

const required = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for the optional variables', () => {
    expect(validateEnv(required)).toEqual({
      ...required,
      PORT: 3001,
      FRONT_URL: 'http://localhost:3000',
      PUBLIC_API_URL: 'http://localhost:3001/api',
      JWT_EXPIRES_IN_SECONDS: 604800,
      CHAINS: [],
      INDEXER_POLL_MS: 4000,
      UPLOAD_DIR: 'uploads',
      UPLOAD_DAILY_LIMIT: 30,
      RATE_LIMIT_ENABLED: true,
      TRUST_PROXY: 0,
    });
  });

  it.each([
    ['RATE_LIMIT_ENABLED', 'maybe'],
    ['TRUST_PROXY', '-1'],
    ['UPLOAD_DAILY_LIMIT', '0'],
  ])('rejects an invalid %s', (name, value) => {
    expect(() => validateEnv({ ...required, [name]: value })).toThrow(
      new RegExp(name),
    );
  });

  it('builds the default PUBLIC_API_URL from PORT and drops a final slash', () => {
    expect(validateEnv({ ...required, PORT: '4000' }).PUBLIC_API_URL).toBe(
      'http://localhost:4000/api',
    );
    expect(
      validateEnv({ ...required, PUBLIC_API_URL: 'https://api.example.com/' })
        .PUBLIC_API_URL,
    ).toBe('https://api.example.com');
  });

  it('rejects an invalid PUBLIC_API_URL', () => {
    expect(() => validateEnv({ ...required, PUBLIC_API_URL: 'nope' })).toThrow(
      /PUBLIC_API_URL/,
    );
  });

  it('parses PORT from its string form', () => {
    expect(validateEnv({ ...required, PORT: '4000' }).PORT).toBe(4000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ JWT_SECRET: required.JWT_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects an invalid PORT', () => {
    expect(() => validateEnv({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an invalid FRONT_URL', () => {
    expect(() => validateEnv({ ...required, FRONT_URL: 'nope' })).toThrow(
      /FRONT_URL/,
    );
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => validateEnv({ ...required, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });
});
