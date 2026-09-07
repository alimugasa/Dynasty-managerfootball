import { defineConfig, devices } from '@playwright/test';

// Four widths matching how this game is actually used and reviewed.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    { name: '320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 700 } } },
    { name: '390', use: { ...devices['iPhone 13'] } },
    { name: '768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: '1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
});
