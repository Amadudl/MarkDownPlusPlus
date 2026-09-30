import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real, built Electron app (`npm run build:app`
 * first; `npm run test:e2e` does both). Tests run serially: every test starts
 * its own Electron instance with an isolated user data directory, see
 * `tests/e2e/fixtures.ts`.
 */
// Locally on macOS and Windows, run test windows invisibly and without stealing focus
// (see src/main/window.ts), so developers can keep working while the suite runs; set
// MPP_E2E_BACKGROUND=0 to watch the tests. Off on CI (nobody works there) and on Linux,
// where Electron cannot make windows transparent and an unfocused, click-through window
// under Xvfb stops producing frames, which makes the suite ~10x slower and flaky.
process.env.MPP_E2E_BACKGROUND ??= process.env.CI || process.platform === 'linux' ? '0' : '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Fail fast on CI when something is systematically broken (e.g. the app does not start).
  maxFailures: process.env.CI ? 10 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
