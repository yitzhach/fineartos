/* The tabs inside windows: windows.spec.ts only sees each app's first view.
   Here every tab in Connect, Finance and Commission Studio, and the whole of
   Settings, is opened in turn on a fresh demo desktop and audited the same
   way: page errors, console errors, accessibility scoped to the window in
   front and, on a phone, sideways scroll. Known issues share
   windows-known.json, keyed "<Window>/<tab> <finding>". */
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../../lib/test';

const front = '.frame[data-focused="true"]';
const KNOWN_FILE = path.join(__dirname, 'windows-known.json');
const known: Record<string, string> = fs.existsSync(KNOWN_FILE)
  ? JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8')) : {};

interface Case {
  window: string;
  /** Bring the window to the front of a freshly loaded demo desktop. */
  open: (page: Page) => Promise<void>;
  /** Tab names, matched from the start (counts follow some of them). */
  tabs: string[];
  /** Where the tab buttons live, inside the window in front. */
  strip: string;
}

const dock = (name: string) => async (page: Page) => {
  const button = page.locator('nav.dock').getByRole('button', { name, exact: true });
  test.skip(await button.count() === 0, `${name} is not in this dock`);
  await button.click();
};

const CASES: Case[] = [
  {
    window: 'Connect',
    open: dock('Connect'),
    tabs: ['Guest book', 'Mailing list', 'Send a picture', 'QR & contact card', 'Booth mode'],
    strip: '.connect-tabs',
  },
  {
    window: 'Finance',
    open: dock('Finance'),
    tabs: ['Overview', 'Money in', 'Payment due', 'Money out', 'Statement'],
    strip: '.fin-bar .chip-row >> nth=0',
  },
  {
    // The demo commission opens itself at load and takes the front.
    window: 'Commission Studio',
    open: async () => {},
    tabs: ['Overview', 'Details', 'Document', 'Files', 'Milestones', 'Tasks', 'Invoices', 'Client', 'Notes'],
    strip: 'nav.pj-tabs',
  },
  {
    // One page of sections, no tabs: opened from the profile menu.
    window: 'Settings',
    open: async (page) => {
      await page.getByRole('button', { name: 'Profile and settings' }).click();
      await page.getByRole('dialog', { name: 'Profile' }).getByRole('button', { name: 'Settings', exact: true }).click();
    },
    tabs: [],
    strip: '',
  },
];

async function audit(page: Page, phone: boolean): Promise<string[]> {
  const problems: string[] = [];
  const violations = (await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include(front).analyze()).violations;
  for (const v of violations) {
    problems.push(`a11y:${v.id} ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  }
  if (phone) {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 1) problems.push(`overflow: page scrolls sideways by ${wide}px`);
  }
  return problems;
}

for (const c of CASES) {
  test(`tabs: ${c.window}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message.split('\n')[0]}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().split('\n')[0].slice(0, 160)}`); });

    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(front)).toBeVisible();
    await c.open(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page.locator(front)).toHaveAttribute('aria-label', c.window);

    const phone = info.project.name === 'phone';
    const findings: string[] = [];
    const record = (where: string, list: string[]) => findings.push(...list.map(p => `${where} ${p}`));

    // Lazy windows draw after their chunk lands; slower on the live site.
    if (c.tabs.length > 0) await expect(page.locator(front).locator(c.strip)).toBeVisible();
    if (c.tabs.length === 0) record(c.window, await audit(page, phone));
    for (const name of c.tabs) {
      const where = `${c.window}/${name}`;
      const strip = page.locator(front).locator(c.strip);
      const button = strip.getByRole('button', { name: new RegExp(`^${name.replace(/[&]/g, '\\$&')}`) }).first();
      if (await button.count() === 0) { findings.push(`${where} missing: no such tab`); continue; }
      await button.click();
      // Not networkidle: a tab may keep a request open (see the report).
      await page.waitForTimeout(800);
      // A tab that throws the window away (or swaps it) is a finding too.
      if (await page.locator(front).getAttribute('aria-label') !== c.window) {
        findings.push(`${where} lost: window in front is no longer ${c.window}`);
        break;
      }
      record(where, errors.splice(0));
      record(where, await audit(page, phone));
    }
    record(c.window, errors.splice(0));

    const fresh = findings.filter(p => !Object.keys(known).some(k => p.startsWith(k)));
    info.annotations.push(...findings.map(p => ({ type: 'finding', description: p })));
    expect(fresh, `${c.window} (${info.project.name})`).toEqual([]);
  });
}
