import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config — unit + Firestore Rules tests.
 *
 * - Unit tests (`tests/unit/**`) require no external services.
 * - Rules tests (`tests/rules/**`) require the Firebase Emulator running
 *   (`pnpm emulators`); see README "Testing" for the standard workflow.
 * - E2E tests are in `tests/e2e/**` and run via Playwright (`pnpm test:e2e`),
 *   not via Vitest.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/rules/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
