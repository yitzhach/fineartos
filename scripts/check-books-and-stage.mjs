/**
 * Browser check for two things:
 *
 *  - ticking a stage off offers to tell the client, and the offer starts an
 *    update about that stage rather than writing or sending one, and
 *  - the books as a file: saved, read back in, and read back in twice without
 *    the rows doubling.
 *
 * It also exports a commission and looks inside the file, because the point of
 * the change is what the file carries.
 *
 *   npm run build && npm run preview -- --port 4181
 *   node scripts/check-books-and-stage.mjs > /tmp/books.txt 2>&1
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:4181/';
const TMP = process.env.TMP_DIR ?? '/tmp';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const errors = [];
const notes = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

// --- Ticking a stage offers to tell the client -----------------------------
const frame = page.locator('.frame[data-focused="true"]');
// The demo has stages already ticked; the offer is about one being finished.
const stage = frame.locator('.milestones li').filter({ has: page.locator('button[data-done="false"]') }).first();
const stageName = (await stage.locator('.ms-label').innerText()).trim();
await stage.locator('button').first().click();
await page.waitForTimeout(500);
const offer = frame.locator('.ms-offer');
notes.push(`offer shown after ticking “${stageName}”: ${(await offer.count()) > 0}`);
await offer.getByRole('button', { name: 'Write an update' }).click();
await page.waitForTimeout(700);
notes.push(`headline filled from the stage: ${await page.inputValue('#upd-headline')}`);
notes.push(`nothing saved by ticking: ${(await page.locator('.upd-list li').count()) === 0}`);

await page.fill('#upd-note', 'The ground is down.');
await page.getByRole('button', { name: 'Save the update' }).click();
await page.waitForTimeout(800);
notes.push(`update saved: ${await page.locator('.upd-list li').count()}`);

// Told once is told: ticking that stage again must not offer a second time.
await frame.getByRole('button', { name: 'Overview', exact: true }).first().click();
await page.waitForTimeout(500);
const again = frame
  .locator('.milestones li')
  .filter({ hasText: stageName })
  .first()
  .locator('button')
  .first();
await again.click();            // untick
await page.waitForTimeout(400);
await again.click();            // tick again
await page.waitForTimeout(500);
notes.push(`offered again for a stage already told about: ${(await frame.locator('.ms-offer').count()) > 0}`);

// --- What the commission file carries --------------------------------------
const exported = page.waitForEvent('download');
await frame.getByRole('button', { name: 'Export', exact: true }).first().click();
const file = `${TMP}/exported.json`;
await (await exported).saveAs(file);
const envelope = JSON.parse(readFileSync(file, 'utf8'));
notes.push(`export version: ${envelope.version}`);
notes.push(`client updates in the file: ${envelope.updates?.length}`);

// --- The books as a file ---------------------------------------------------
await page.getByRole('button', { name: 'Finance', exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByRole('button', { name: 'Profit and loss', exact: true }).first().click()
  .catch(() => page.getByRole('button', { name: /statement/i }).first().click());
await page.waitForTimeout(700);
const booksDownload = page.waitForEvent('download');
await page.getByRole('button', { name: 'Save the books as a file' }).click();
await (await booksDownload).saveAs(`${TMP}/books.json`);
const books = JSON.parse(readFileSync(`${TMP}/books.json`, 'utf8'));
notes.push(`books file schema: ${books.schema} v${books.version}, ${books.expenses.length} rows`);

// A row written by hand, imported twice: the second time must change nothing.
books.expenses.push({
  id: 'imported-1', date: '2026-04-02', category: 'framing', what: 'Two frames',
  amount: 18000, miles: null, ratePerMile: null, receiptImageIds: [],
  jobRef: null, note: null, createdAt: '2026-04-02T09:00:00.000Z',
  updatedAt: '2026-04-02T09:00:00.000Z',
});
writeFileSync(`${TMP}/books-one.json`, JSON.stringify(books));
const input = page.getByLabel('Read a books file back in');
await input.setInputFiles(`${TMP}/books-one.json`);
await page.waitForTimeout(900);
notes.push('first import said: ' + (await page.locator('.notice').first().innerText().catch(() => '(no message element)')));
await input.setInputFiles(`${TMP}/books-one.json`);
await page.waitForTimeout(900);
notes.push('second import said: ' + (await page.locator('.notice').first().innerText().catch(() => '(no message element)')));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const rows = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const open = indexedDB.open('artist-os');
      open.onsuccess = () => {
        const req = open.result.transaction('expenses').objectStore('expenses').getAll();
        req.onsuccess = () => resolve(req.result.length);
      };
      open.onerror = () => resolve('could not open the database');
    }),
);
notes.push(`expense rows stored after importing the same file twice: ${rows}`);

// --- Phone width -----------------------------------------------------------
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(700);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
notes.push(`horizontal overflow at 390px: ${overflow}`);

await browser.close();
console.log('NOTES\n' + notes.join('\n'));
console.log('\nERRORS\n' + (errors.length ? errors.join('\n') : 'none'));
