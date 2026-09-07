import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Some environments ship only a prebuilt Chromium, and one that does not match
// the build this Playwright version would download. Where that is the case,
// point at it and pin every project to Chromium; everywhere else this is an
// empty object and each project keeps its own default engine.
//
// Pinning the engine matters: the 390 project uses the iPhone 13 descriptor,
// which defaults to WebKit. Handing WebKit a Chromium executable fails to
// launch, and every test in that project errors before it runs.
const PREBUILT = '/opt/pw-browsers/chromium';
const constrained = existsSync(PREBUILT)
  ? { browserName: 'chromium' as const, launchOptions: { executablePath: PREBUILT } }
  : {};

// Five widths matching how this game is actually used and reviewed. 375 is the
// width the shell is specified against; 320 is the floor it must survive.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    { name: '320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 700 }, ...constrained } },
    { name: '375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, ...constrained } },
    { name: '390', use: { ...devices['iPhone 13'], ...constrained } },
    { name: '768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, ...constrained } },
    { name: '1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, ...constrained } },
  ],
});
