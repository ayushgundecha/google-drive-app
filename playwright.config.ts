import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'NODE_ENV=test npx tsx scripts/e2e-server.ts',
    url: 'http://127.0.0.1:3100/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
