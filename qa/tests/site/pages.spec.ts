/* This project's own specs live in this folder. This one is an example: every
   page has a title. Locate by role and name, as a user would:
   page.getByRole('button', { name: 'Menu' }). */
import { test, expect } from '../../lib/test';
import { site } from '../../lib/site';

test.skip(() => test.info().project.name !== test.info().config.projects[0].name,
  'markup: one project is enough');

for (const pagePath of site.pages) {
  test(`${pagePath} has a title`, async ({ page }) => {
    await page.goto(pagePath);
    await expect(page).toHaveTitle(/\S/);
  });
}
