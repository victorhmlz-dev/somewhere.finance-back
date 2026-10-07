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
      JWT_EXPIRES_IN_SECONDS: 604800,
    });
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
