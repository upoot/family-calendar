import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'cd server && node index.js',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: { DB_PATH: '/tmp/e2e-test.db', JWT_SECRET: 'e2e-test-secret' },
    },
    {
      command: 'cd client && npm run dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
