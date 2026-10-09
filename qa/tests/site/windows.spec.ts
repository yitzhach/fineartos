/* Every app in the dock, opened one at a time on a fresh demo desktop and
   audited as it opens: page errors, console errors, accessibility (WCAG AA,
   scoped to the window that opened) and, on a phone, sideways scroll.
   The audit in tests/audit.spec.ts only sees the desktop as it first loads;
   this is what reaches the windows. Known issues live in windows-known.json
   with the reason, so only a new one fails. */
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../lib/test';

const APPS = ['Home', 'Projects', 'Invoices', 'Finder', 'Connect', 'Artwork', 'Shows',
  'Finance', 'Clients', 'Notes', 'Calendar', 'Visualizer', 'Assistant', 'Trash'];

const KNOWN_FILE = path.join(__dirname, 'windows-known.json');
const known: Record<string, string> = fs.existsSync(KNOWN_FILE)
  ? JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8')) : {};

for (const app of APPS) {
  test(`window: ${app}`, async ({ page }, info) => {
    const problems: string[] = [];
    page.on('pageerror', e => problems.push(`pageerror: ${e.message.split('\n')[0]}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text().split('\n')[0].slice(0, 160)}`); });

    await page.goto('./');
    const dock = page.locator('nav.dock');
    await expect(dock).toBeVisible();
    const button = dock.getByRole('button', { name: app, exact: true });
    test.skip(await button.count() === 0, `${app} is not in this dock`);
    await button.click();
    await page.waitForTimeout(800);

    const focused = page.locator('.frame[data-focused="true"]');
    const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    // No window in front (Home shows the desktop): tests/audit.spec.ts has that.
    const violations = await focused.count() > 0
      ? (await axe.include('.frame[data-focused="true"]').analyze()).violations : [];
    for (const v of violations) {
      problems.push(`a11y:${v.id} ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
    }

    if (info.project.name === 'phone') {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (wide > 1) problems.push(`overflow: page scrolls sideways by ${wide}px`);
    }

    // "Calendar a11y:aria-required-children": the same in every project.
    const key = (p: string) => `${app} ${p.split(' ')[0]}`;
    const fresh = problems.filter(p => !(key(p) in known));
    info.annotations.push(...problems.map(p => ({ type: 'finding', description: p })));
    expect(fresh, `${app} (${info.project.name})`).toEqual([]);
  });
}
