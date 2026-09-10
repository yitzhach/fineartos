/**
 * Acceptance run for Phase 1.
 *
 * Drives a real browser through the checks the brief lists as "done means":
 * create a document with an image, reload it, edit pricing and record a
 * partial payment, duplicate, issue and revise, print, work offline, and check
 * tablet and phone layouts. Screenshots and PDFs land in OUT.
 *
 *   npm run build && npm run preview      # in one terminal
 *   npm run acceptance                    # in another
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.ACCEPTANCE_OUT ?? 'acceptance-output';
const URL = process.env.ACCEPTANCE_URL ?? 'http://localhost:4180/';
// Set PLAYWRIGHT_CHROMIUM when the bundled browser is not where Playwright expects.
const CHROME = process.env.PLAYWRIGHT_CHROMIUM;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors = [];
const notes = [];

// One persistent context, so IndexedDB survives reloads and viewport changes
// exactly as it would for a real artist on one device.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const fill = (sel, val) => page.fill(sel, val);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/01-desktop-empty.png` });

await page.getByRole('button', { name: 'New document' }).first().click();
await page.waitForSelector('#studio-name');
await fill('#studio-name', 'Isaac Anderson Studio');
await fill('#studio-email', 'studio@example.com');
await fill('#studio-address', '42 Kiln Lane, Santa Fe, NM');
await fill('#doc-title', 'Lobby triptych');
await fill('#client-name', 'Ruiz Collection');
await fill('#client-email', 'art@example.com');
await fill('#art-desc', 'Three-panel oil on cradled birch, warm ochre and slate.');
await fill('#art-w', '72');
await fill('#art-h', '48');
await fill('#art-materials', 'Oil on cradled birch');
await fill('#art-finish', 'Satin varnish, cleated for flush hang');
await fill('#sched-notes', 'Delivered and installed by the studio in one day.');

// A real-looking reference image rather than a 1x1 dot.
const img = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 160;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 240, 160);
  grad.addColorStop(0, '#b5764c');
  grad.addColorStop(1, '#6b655c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 240, 160);
  return c.toDataURL('image/png').split(',')[1];
});
await page.setInputFiles('#art-images', {
  name: 'ref.png',
  mimeType: 'image/png',
  buffer: Buffer.from(img, 'base64'),
});
await page.waitForTimeout(500);

await page.locator('input[aria-label="Line description"]').first().fill('Lobby triptych, three panels');
const u1 = page.locator('input[aria-label="Unit price"]').first();
await u1.fill('9500.00');
await u1.blur();
await page.getByRole('button', { name: 'Add delivery' }).click();
await page.locator('input[aria-label="Line description"]').nth(1).fill('Delivery and installation');
const u2 = page.locator('input[aria-label="Unit price"]').nth(1);
await u2.fill('850.00');
await u2.blur();
await fill('#tax-rate', '8.25');
await fill('#dep-value', '50');
await page.locator('#dep-value').blur();
await page.waitForTimeout(300);
await fill('#pay-amount', '4000');
await fill('#pay-note', 'Deposit, bank transfer');
await page.getByRole('button', { name: 'Record payment' }).click();
await page.waitForTimeout(400);
await fill('#terms-body', 'Deposit is non-refundable once panels are prepared. Balance due on installation.');
await fill('#terms-rev', 'Two rounds of revision at the sketch stage.');
await fill('#private-notes', 'INTERNAL SECRET: client asked for a discount; hold at list.');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-editor.png`, fullPage: true });

// --- Reload: does the work survive? ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/03-desktop-with-doc.png` });
await page.locator('.desktop-icon').first().click();
await page.waitForTimeout(700);
notes.push('after reload, title = ' + (await page.inputValue('#doc-title')));
notes.push('after reload, private notes kept = ' + (await page.inputValue('#private-notes')).includes('SECRET'));
notes.push('after reload, image still shown = ' + ((await page.locator('.section img').count()) > 0));
notes.push('after reload, balance = ' + (await page.locator('.totals').last().innerText()).replace(/\n/g, ' | '));

// --- Issue, then revise: the snapshot must not move ---
await page.getByRole('button', { name: 'Issue', exact: true }).click();
await page.waitForTimeout(600);
await fill('#doc-title', 'Lobby triptych - revised');
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Preview', exact: true }).click();
await page.waitForTimeout(500);
notes.push('draft preview title = ' + (await page.locator('.client-doc .meta').innerText()).split('\n')[1]);
await page.getByRole('button', { name: /Viewing current draft/ }).click();
await page.waitForTimeout(500);
notes.push('issued snapshot title = ' + (await page.locator('.client-doc .meta').innerText()).split('\n')[1]);
await page.screenshot({ path: `${OUT}/09-issued-version.png` });
await page.getByRole('button', { name: /Viewing issued version/ }).click();
await page.waitForTimeout(400);

await page.screenshot({ path: `${OUT}/04-client-preview.png` });
const previewHtml = await page.locator('.client-doc').innerHTML();
notes.push('private notes leaked into client preview = ' + previewHtml.includes('INTERNAL SECRET'));

await page.emulateMedia({ media: 'print' });
await page.pdf({ path: `${OUT}/client-letter.pdf`, format: 'Letter', printBackground: true });
await page.pdf({ path: `${OUT}/client-a4.pdf`, format: 'A4', printBackground: true });
await page.screenshot({ path: `${OUT}/05-print-media.png`, fullPage: true });
await page.emulateMedia({ media: 'screen' });

// --- Duplicate: no receipts, no issued history ---
await page.getByRole('button', { name: 'Back to editor' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Duplicate' }).click();
await page.waitForTimeout(900);
notes.push('duplicate number = ' + (await page.inputValue('#doc-number')));
notes.push('duplicate payment rows = ' + (await page.locator('.doc-row').count()));
notes.push('duplicate state = ' + (await page.locator('fieldset.section .hint').nth(1).innerText()).trim());

// --- Offline: create and edit a draft with the network cut ---
await ctx.setOffline(true);
await page.getByRole('button', { name: 'New', exact: true }).click();
await page.waitForTimeout(800);
await fill('#doc-title', 'Drafted at the show, offline');
await fill('#client-name', 'Booth walk-up');
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
notes.push('offline reload showed: ' + JSON.stringify(await page.locator('.desktop-icon .label').allInnerTexts()));
await page.screenshot({ path: `${OUT}/10-offline.png` });
await ctx.setOffline(false);

// --- Tablet and phone, same stored data ---
for (const [name, size] of [
  ['06-tablet', { width: 834, height: 1112 }],
  ['07-phone', { width: 390, height: 844 }],
]) {
  await page.setViewportSize(size);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('.desktop-icon').first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  notes.push(`${name}: horizontal overflow = ${over}`);
}

// --- Light mode ---
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Switch to light mode/i }).click().catch(() => {});
await page.waitForTimeout(500);
await page.locator('.desktop-icon').first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/08-light.png` });

console.log(notes.join('\n'));
console.log('ERRORS: ' + (errors.length ? JSON.stringify(errors) : 'none'));
console.log(`Screenshots and PDFs written to ${OUT}/`);
await browser.close();
