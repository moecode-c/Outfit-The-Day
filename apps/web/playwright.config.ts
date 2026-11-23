import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end + side tests. Needs the API (seeded DB, THROTTLE_DISABLED=true) and the web app running:
 *   WEB_URL defaults to http://localhost:3100 (see README "Tests").
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // tests share one seeded database (stock, orders)
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    // Cross-browser run (nightly CI / PW_ALL_BROWSERS=1): Firefox + WebKit desktop, iPhone Safari.
    ...(process.env.PW_ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 900 } } },
          { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 900 } } },
          { name: 'mobile-safari', use: { ...devices['iPhone 14'] }, grep: /@mobile/ },
        ]
      : []),
  ],
});
