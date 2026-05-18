import { expect, test } from '@playwright/test';

/**
 * Marketing landing smoke — the root route must render without console errors
 * for unauthenticated visitors and offer a sign-up entry point.
 *
 * This is the minimum E2E gate per the security/QA audit's release-readiness
 * checklist. Auth-protected flows (consent, capture, compare) are tracked as
 * follow-ups in the audit plan (`~/.claude/plans/eventual-hopping-peach.md`).
 */
test('marketing landing renders and exposes a CTA', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Skip Next.js dev-only HMR cross-origin chatter — it's a Next 16
    // dev-server quirk that doesn't appear in production builds.
    if (text.includes('webpack-hmr')) return;
    if (text.includes('Cross-Origin')) return;
    consoleErrors.push(text);
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
  await expect(page.getByRole('main')).toBeVisible();

  // At least one anchor leading to /login or /signup should exist —
  // marketing without a conversion path is a regression.
  const ctaCount = await page
    .locator('a[href*="/login"], a[href*="/signup"]')
    .count();
  expect(ctaCount).toBeGreaterThan(0);

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('\n')}`).toEqual([]);
});
