// Default env vars for e2e tests when the environment doesn't already provide them.
// Override any of these via the shell/CI environment — this file only fills gaps.
process.env.JWT_SECRET ??= 'test-jwt-secret-not-for-production'
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret-not-for-production'
process.env.DATABASE_URL ??=
  'postgresql://vallorai:vallorai_local@localhost:5432/vallorai_dev?schema=public'
process.env.NODE_ENV ??= 'test'
