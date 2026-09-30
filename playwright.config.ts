import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real, built Electron app (`npm run build:app`
 * first; `npm run test:e2e` does both). Tests run serially: every test starts
 * its own Electron instance with an isolated user data directory, see
 * `tests/e2e/fixtures.ts`.
 */
// Run test windows invisibly and without stealing focus (see src/main/window.ts),
// so developers can keep working while the suite runs. Set MPP_E2E_BACKGROUND=0
// to watch the tests.
process.env.MPP_E2E_BACKGROUND ??= '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
