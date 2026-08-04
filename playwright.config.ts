import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173/aviation-data-integrity-console/',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/aviation-data-integrity-console/',
    // A stale preview can make local tests pass or fail against yesterday's
    // bundle. Always build and own the server used by this test run.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
