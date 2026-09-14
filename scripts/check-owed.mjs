/**
 * Browser check for Finance → Payment due, and for the invoice links on
 * Money in. Run against the preview build:
 *
 *   npm run build && npm run preview -- --port 4180
 *   node scripts/check-owed.mjs > /tmp/owed.txt 2>&1
 *
 * It covers the two things that have shipped broken here before: starting
 * against an EXISTING database, and a SECOND TAB open at the same time.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'owed-output';
const URL = process.env.URL ?? 'http://localhost:4180/';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const errors = [];
const notes = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
};
watch(page, 'tab1');

const openFinance = async (p) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await p.getByRole('button', { name: 'Finance', exact: true }).first().click();
    await p.waitForTimeout(900);
    if (await p.getByRole('button', { name: 'Money in', exact: true }).count()) return;
  }
  notes.push('Finance would not come to the front');
};

await page.goto(URL, { waitUntil: 'networkidle' });

// The app seeds a demo commission and opens it. Issue it (a draft is owed
// nothing) and raise an invoice off it, so both kinds of row exist.
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Issue', exact: true }).click().catch((e) => notes.push('issue: ' + e.message));
await page.waitForTimeout(900);
await page.getByRole('button', { name: 'Create invoice' }).first().click().catch((e) => notes.push('create invoice: ' + e.message));
await page.waitForTimeout(1200);
notes.push('buttons after invoicing = ' + JSON.stringify((await page.locator('button').allInnerTexts()).slice(0, 24)));
await page.fill('#pay-amount', '500').catch(() => notes.push('no #pay-amount on the invoice'));
await page.getByRole('button', { name: 'Record payment' }).click().catch(() => notes.push('no Record payment'));
await page.waitForTimeout(800);

// A second commission, issued and never invoiced: the lingering case. A
// duplicate of the demo carries no invoice, which is exactly the shape.
await page.getByRole('button', { name: /^Close Invoice/ }).first().click().catch(() => {});
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Duplicate' }).first().click().catch((e) => notes.push('duplicate: ' + e.message));
await page.waitForTimeout(1200);
await page
  .locator('.frame[data-focused="true"]')
  .getByRole('button', { name: 'Issue', exact: true })
  .first()
  .click()
  .catch((e) => notes.push('issue 2: ' + e.message.split('\n')[0]));
await page.waitForTimeout(1000);

// --- Reload first: everything below runs against an EXISTING database. ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

await openFinance(page);
await page.getByRole('button', { name: /^Payment due/ }).click();
await page.waitForTimeout(500);
notes.push('tab label = ' + (await page.getByRole('button', { name: /^Payment due/ }).innerText()));
notes.push('rows = ' + JSON.stringify(await page.locator('.fin-rows li').allInnerTexts()));
await page.screenshot({ path: `${OUT}/01-payment-due.png`, fullPage: true });
// Clicking a row must open that record.
const opened = await page.locator('.fin-open').count();
notes.push('clickable rows = ' + opened);
if (opened > 0) {
  await page.locator('.fin-open').first().click();
  await page.waitForTimeout(800);
  notes.push('after clicking a due row, windows = ' + JSON.stringify(await page.locator('.frame-title .t').allInnerTexts()));
  await page.screenshot({ path: `${OUT}/02-opened-from-due.png`, fullPage: true });
}

// Money in: the invoice payment row must open the invoice.
await openFinance(page);
await page.getByRole('button', { name: 'Money in', exact: true }).click();
await page.waitForTimeout(400);
notes.push('money in rows = ' + JSON.stringify(await page.locator('.fin-rows li').allInnerTexts()));
notes.push('money in links = ' + (await page.locator('.fin-open').count()));
await page.locator('.fin-open').first().click().catch(() => notes.push('no link to click on money in'));
await page.waitForTimeout(800);
notes.push('after clicking a money-in row, windows = ' + JSON.stringify(await page.locator('.frame-title .t').allInnerTexts()));
await page.screenshot({ path: `${OUT}/03-money-in.png`, fullPage: true });

// --- A second tab, open at the same time. ---
const two = await ctx.newPage();
watch(two, 'tab2');
await two.goto(URL, { waitUntil: 'networkidle' });
await two.waitForTimeout(1200);
await openFinance(two);
await two.getByRole('button', { name: /^Payment due/ }).click();
await two.waitForTimeout(600);
notes.push('tab2 rows = ' + JSON.stringify(await two.locator('.fin-rows li').allInnerTexts()));
await two.screenshot({ path: `${OUT}/04-second-tab.png`, fullPage: true });
await page.bringToFront();
await page.waitForTimeout(600);
notes.push('tab1 still alive with tab2 open = ' + (await page.locator('.fin-rows li').count()) + ' rows');

// --- Phone. ---
await two.close();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await openFinance(page);
await page.getByRole('button', { name: /^Payment due/ }).click();
await page.waitForTimeout(600);
notes.push('phone horizontal overflow = ' + (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await page.screenshot({ path: `${OUT}/05-phone.png`, fullPage: true });

console.log(notes.join('\n'));
console.log('ERRORS: ' + (errors.length ? JSON.stringify(errors, null, 1) : 'none'));
await browser.close();
