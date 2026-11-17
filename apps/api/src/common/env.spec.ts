import { assertEnv, checkEnv } from './env';

const strong = (c: string) => c.repeat(64);
const prod = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.mongodb.net/otd',
  JWT_ACCESS_SECRET: strong('a'),
  JWT_REFRESH_SECRET: strong('b'),
  WEB_ORIGIN: 'https://otd.example',
  R2_BUCKET: 'otd',
  SMTP_HOST: 'smtp.resend.com',
};

describe('checkEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(checkEnv(prod)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects placeholder, short or shared JWT secrets in production', () => {
    expect(checkEnv({ ...prod, JWT_ACCESS_SECRET: 'change-me' }).errors.join()).toMatch(/JWT_ACCESS_SECRET must be a random value/);
    expect(checkEnv({ ...prod, JWT_REFRESH_SECRET: 'short' }).errors.join()).toMatch(/JWT_REFRESH_SECRET/);
    expect(checkEnv({ ...prod, JWT_REFRESH_SECRET: prod.JWT_ACCESS_SECRET }).errors.join()).toMatch(/must be different/);
  });

  it('requires https origin, a real database and durable uploads in production', () => {
    const r = checkEnv({ ...prod, WEB_ORIGIN: 'http://otd.example', MONGODB_URI: 'mongodb://localhost:27017/otd', R2_BUCKET: undefined });
    expect(r.errors).toHaveLength(3);
    expect(checkEnv({ ...prod, R2_BUCKET: undefined, ALLOW_DISK_UPLOADS: 'true' }).errors).toEqual([]);
  });

  it('only warns in development', () => {
    const r = checkEnv({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'change-me', JWT_REFRESH_SECRET: 'change-me-too' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('assertEnv throws with every problem listed', () => {
    const warn = jest.fn();
    expect(() => assertEnv({ ...prod, JWT_ACCESS_SECRET: '', WEB_ORIGIN: '' }, { warn })).toThrow(/JWT_ACCESS_SECRET is not set[\s\S]*WEB_ORIGIN/);
  });
});
