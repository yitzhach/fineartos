/**
 * Browser check for two things:
 *
 *  - the PDF hand-off on a client update (Print / Save as PDF), and
 *  - emptying the Trash taking a commission's updates with it, which it used
 *    to leave behind as orphans.
 *
 * Run against the preview build:
 *
 *   npm run build && npm run preview -- --port 4181
 *   node scripts/check-update-pdf.mjs > /tmp/pdf.txt 2>&1
 *
 * Headless Chromium treats window.print() as a no-op, so what this proves is
 * that the page is built, printed from and recorded without throwing — not
 * what the dialog looks like. That last part is still a human's job.
 */
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4181/';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const errors = [];
const notes = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const updateRows = (p) =>
  p.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('artist-os');
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('clientUpdates')) return resolve('no updates store');
          const req = db.transaction('clientUpdates').objectStore('clientUpdates').getAll();
          req.onsuccess = () => resolve(req.result.length);
          req.onerror = () => resolve('could not read updates');
        };
        open.onerror = () => resolve('could not open the database');
      }),
  );

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

// --- Write an update on the demo commission -------------------------------
const frame = page.locator('.frame[data-focused="true"]');
await frame.getByRole('button', { name: 'Client', exact: true }).first().click();
await page.waitForTimeout(600);
await page.fill('#upd-headline', 'Underpainting done');
await page.fill('#upd-note', 'The ground is down and the drawing is holding.');
await page.getByRole('button', { name: 'Save the update' }).click();
await page.waitForTimeout(900);

// --- The PDF hand-off ------------------------------------------------------
const pdfButton = page.getByRole('button', { name: 'Print / Save as PDF' });
notes.push(`PDF button present: ${(await pdfButton.count()) > 0}`);
await pdfButton.first().click();
await page.waitForTimeout(1500);
const body = await page.locator('body').innerText();
notes.push(`recorded the PDF hand-off: ${body.includes('Printed or saved as a PDF')}`);
notes.push(`said the dialog is open: ${body.includes('print dialog is open')}`);
notes.push(`hidden print frame cleaned up: ${(await page.locator('iframe[title="Printing"]').count()) === 0}`);

// A second tab has to agree once it reloads: the record is in the database.
const second = await ctx.newPage();
second.on('pageerror', (e) => errors.push(`tab2 pageerror: ${e.message}`));
await second.goto(URL, { waitUntil: 'networkidle' });
await second.waitForTimeout(1400);
notes.push(`updates stored, seen from a second tab: ${await updateRows(second)}`);

// --- Emptying the Trash takes the updates with it --------------------------
await page.bringToFront();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Close/ }).first().click().catch(() => {});
await page.waitForTimeout(600);

// The commission goes in the Trash, and emptying it has to name the update.
await page.getByRole('button', { name: /Harbour triptych/ }).first().click();
await page.getByRole('button', { name: 'Move to Trash' }).first().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Trash', exact: true }).last().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Empty Trash' }).first().click();
await page.waitForTimeout(500);
const asked = await page.locator('.trash-confirm').innerText().catch(() => '(no confirmation)');
notes.push('the question asked: ' + asked.replace(/\n/g, ' / '));
await page.getByRole('button', { name: /^Delete .* forever$/ }).first().click();
await page.waitForTimeout(1200);
notes.push(`updates left after emptying: ${await updateRows(page)}`);
await second.reload({ waitUntil: 'networkidle' });
await second.waitForTimeout(1000);
notes.push(`second tab agrees: ${await updateRows(second)}`);

await browser.close();
console.log('NOTES\n' + notes.join('\n'));
console.log('\nERRORS\n' + (errors.length ? errors.join('\n') : 'none'));
