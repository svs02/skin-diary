import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config.
 *
 * `webServer` auto-starts `pnpm dev` on port 3000 and waits for readiness.
 * Reuses an existing dev server if one is already running on the port.
 *
 * NEXT_PUBLIC_FIREBASE_* env vars must be present in `.env.local` for the
 * Next.js server to boot. Real Firebase isn't used by the current smoke
 * tests — they only exercise public marketing/legal routes — but the boot
 * sequence still needs the config.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
