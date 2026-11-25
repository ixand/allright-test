import { defineConfig, devices } from '@playwright/test';

const SAUCE_URL = process.env.SAUCE_URL ?? 'https://www.saucedemo.com';
const BOOKER_URL = process.env.BOOKER_URL ?? 'https://restful-booker.herokuapp.com';
const STORAGE_STATE = 'playwright/.auth/standard_user.json';
const CI = !!process.env.CI;

const uiBrowsers = [
  { name: 'ui-chromium', device: devices['Desktop Chrome'] },
  { name: 'ui-firefox', device: devices['Desktop Firefox'] },
  { name: 'ui-webkit', device: devices['Desktop Safari'] },
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  // Both targets are public sandboxes; one retry in CI absorbs network blips.
  // A test that passes only on retry is reported as "flaky", never as passed.
  retries: CI ? 1 : 0,
  // The Playwright CI guide recommends one worker on shared CI runners for reproducible runs.
  workers: CI ? 1 : undefined,
  // Keep below the job's timeout-minutes so a hung run still uploads its report.
  globalTimeout: CI ? 15 * 60_000 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    testIdAttribute: 'data-test',
    // CI retries once, so the retry records the trace; locally there is no retry, so keep it on failure.
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'ui-setup',
      testDir: './tests/ui',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: SAUCE_URL },
    },
    ...uiBrowsers.map(({ name, device }) => ({
      name,
      testDir: './tests/ui',
      dependencies: ['ui-setup'],
      use: { ...device, baseURL: SAUCE_URL, storageState: STORAGE_STATE },
    })),
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: BOOKER_URL, extraHTTPHeaders: { Accept: 'application/json' } },
    },
    {
      name: 'generated',
      testDir: './tests/generated',
      use: { ...devices['Desktop Chrome'], baseURL: SAUCE_URL },
    },
  ],
});
