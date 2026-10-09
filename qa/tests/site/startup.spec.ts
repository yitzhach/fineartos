/* Startup: the windows the app opens by itself (restored, or the newest
   commission) arrive after the studio is read. They must never land on top
   of, or replace, an app the artist opened first — and a reload against an
   existing database, with a second tab open, still puts them back. */
import { test, expect } from '../../lib/test';
test.skip(() => test.info().project.name !== 'desktop', 'one is enough');
const front = '.frame[data-focused="true"]';

test('an app opened straight after load stays in front', async ({ page }) => {
  await page.goto('./');
  await page.locator('nav.dock').getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await expect(page.locator(front)).toHaveAttribute('aria-label', 'Calendar');
});

test('existing database + second tab: reload still puts the windows back', async ({ page, context }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await expect(page.locator(front)).toHaveAttribute('aria-label', 'Commission Studio');
  await page.locator('nav.dock').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator(front)).toHaveAttribute('aria-label', 'Notes');
  await page.waitForTimeout(800);
  const second = await context.newPage();
  await second.goto('./');
  await second.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const labels = await page.locator('.frame').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  expect(labels).toContain('Notes');
  expect(labels).toContain('Commission Studio');
  await expect(second.locator('nav.dock')).toBeVisible();
});
