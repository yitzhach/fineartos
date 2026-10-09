/**
 * Phase 4 selling at a show, in a real browser with a second tab open, at
 * desktop and phone widths. The gate: one sale changes Artwork, Finance and
 * the show's tally together, and the Trash undoes it cleanly — take back,
 * put back, take back again, empty — with a reload in between.
 *   npm run build && node scripts/check-selling.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4195;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT ?? '/tmp';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
await wait(2500);
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };

for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 's-')), { executablePath: CHROME, args: ['--no-sandbox'], viewport });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL); await wait(4000);
  const other = await ctx.newPage(); await other.goto(URL); await wait(1500);
  await page.bringToFront();
  const focused = () => page.locator('.frame[data-focused="true"]');
  const open = async (name) => {
    await page.keyboard.press('Escape'); await wait(200);
    await page.keyboard.press('/'); await wait(400);
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).first().click(); await wait(1200);
  };
  const piece = (page) => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('artist-os');
    r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').getAll(); q.onsuccess = () => { r.result.close(); res(q.result.map((row) => row.photo).find((ph) => ph.title === 'River piece')); }; };
  }));

  // A priced piece.
  await page.locator('main input[type=file][accept^="image/png"]').setInputFiles('public/icon-512.png'); await wait(2500);
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('artist-os');
    r.onsuccess = () => {
      const tx = r.result.transaction('photos', 'readwrite'); const s = tx.objectStore('photos');
      s.getAll().onsuccess = (e) => { const row = e.target.result[0]; s.put({ ...row, photo: { ...row.photo, title: 'River piece', price: 800, status: 'available', widthIn: 24, heightIn: 36, paymentLink: 'square.link/u/river' } }); };
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }));
  await page.reload(); await wait(3000);

  await open('Shows');
  await focused().getByLabel('New show name').fill('Spring Market');
  await focused().getByRole('button', { name: 'Add show' }).click(); await wait(800);
  await focused().locator('.sh-piece', { hasText: 'River piece' }).click(); await wait(800);
  await focused().locator('#sh-take').fill('30');
  await focused().locator('#sh-venue').click(); await wait(500);
  const sel = focused().locator('.sh-selling');
  ok(`${label}: tally before`, (await sel.innerText()).includes('0 sold · 1 still out'));

  // Pay QR from the piece's own link.
  await sel.getByRole('button', { name: 'Pay QR' }).click(); await wait(500);
  ok(`${label}: pay QR drawn for the piece link`, (await sel.locator('.sh-payqr canvas').count()) === 1 && (await sel.locator('.sh-payqr').innerText()).includes('https://square.link/u/river'));
  await page.screenshot({ path: `${OUT}/sell-${label}-payqr.png` });

  // Prints go to a hidden frame holding the whole sheet.
  const lastSheet = () => page.evaluate(() => { const f = [...document.querySelectorAll('iframe[srcdoc]')].pop(); return f ? f.srcdoc : ''; });
  await sel.getByRole('button', { name: 'Print price list' }).click(); await wait(800);
  let sheet = await lastSheet();
  ok(`${label}: price list sheet`, sheet.includes('Spring Market') && sheet.includes('$800') && sheet.includes('24 × 36 in'));
  await sel.getByRole('button', { name: 'Print wall labels' }).click(); await wait(800);
  sheet = await lastSheet();
  ok(`${label}: wall labels sheet`, (sheet.match(/class="label"/g) ?? []).length === 1 && sheet.includes('River piece'));

  // Two taps.
  await sel.getByRole('button', { name: 'Sold', exact: true }).click(); await wait(300);
  ok(`${label}: price prefilled from asking`, (await sel.getByLabel(/Sold for/).inputValue()) === '800');
  await sel.getByLabel('Buyer (optional)').fill('Ana');
  await sel.getByRole('button', { name: 'Record sale' }).click(); await wait(800);
  await page.screenshot({ path: `${OUT}/sell-${label}-sold.png` });
  ok(`${label}: tally after, kept after the 30% take`, (await sel.innerText()).includes('1 sold · $800.00 · kept $560.00 · 0 still out'));
  let rec = await piece(page);
  ok(`${label}: piece sold, with the buyer, location client, fee 30%`, rec.status === 'sold' && rec.location === 'client' && rec.sale.buyer === 'Ana' && rec.sale.amount === 80000 && rec.sale.fee === 24000);
  ok(`${label}: no pay QR once sold`, (await sel.getByRole('button', { name: 'Pay QR' }).count()) === 0);
  await sel.getByRole('button', { name: 'Certificate' }).click(); await wait(800);
  sheet = await lastSheet();
  ok(`${label}: certificate sheet`, sheet.includes('Certificate of Authenticity') && sheet.includes('River piece') && sheet.includes('<img src="blob:'));
  const mail = await sel.getByRole('link', { name: 'Email a receipt' }).getAttribute('href');
  ok(`${label}: receipt hands off to mail`, mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('$800.00'));

  await open('Artwork');
  // Artwork's Sales view: the sale is written on the piece, with the show and the buyer.
  await focused().locator('button[aria-pressed]', { hasText: /^Sold$/ }).first().click(); await wait(400);
  const sales = (await focused().innerText()).split('Client view').slice(1).join('');
  ok(`${label}: Artwork's sales list has it`, /River piece\s+2026-\d\d-\d\d\s+Spring Market · Ana\s+\$800\.00/.test(sales));
  await open('Finance');
  const fin = await focused().innerText();
  ok(`${label}: Finance money in = $560 after the 30% take`, /MONEY IN\s+\$560\.00/i.test(fin));

  // Take it back → Trash.
  await open('Shows');
  await focused().locator('.sh-list button', { hasText: 'Spring Market' }).click(); await wait(400);
  await focused().locator('.sh-selling').getByRole('button', { name: 'Take the sale back' }).click(); await wait(800);
  rec = await piece(page);
  ok(`${label}: taken back → available, at the show, sale kept on piece`, rec.status === 'available' && rec.location === 'show' && !rec.sale && rec.trashedSales?.length === 1);
  ok(`${label}: tally back to 0`, (await focused().locator('.sh-selling').innerText()).includes('0 sold · 1 still out'));

  await page.reload(); await wait(3000);
  await open('Finance');
  ok(`${label}: Finance dropped it (after reload)`, !/\$560\.00/.test(await focused().innerText()));
  await open('Trash');
  ok(`${label}: Trash lists the sale`, (await focused().innerText()).includes('Sale of “River piece”'));
  await focused().getByRole('button', { name: /Put back/ }).first().click(); await wait(800);
  rec = await piece(page);
  ok(`${label}: Put back → sold again`, rec.status === 'sold' && rec.sale?.buyer === 'Ana' && rec.trashedSales.length === 0);

  // Take back once more, then empty.
  await open('Shows');
  await focused().locator('.sh-list button', { hasText: 'Spring Market' }).click(); await wait(400);
  await focused().locator('.sh-selling').getByRole('button', { name: 'Take the sale back' }).click(); await wait(800);
  await open('Trash');
  await focused().getByRole('button', { name: 'Empty Trash' }).click(); await wait(400);
  const confirm = await focused().innerText();
  ok(`${label}: empty confirms 1 record, names the sale`, /Delete 1 record forever\?/.test(confirm) && confirm.includes('1 sale'), confirm.match(/Delete[^\n]*/)?.[0]);
  await focused().getByRole('button', { name: /Delete 1 record forever$/ }).click(); await wait(1500);
  rec = await piece(page);
  ok(`${label}: emptied → piece unsold, no sale left anywhere`, rec && rec.status === 'available' && !rec.sale && !rec.trashedSales);
  await page.screenshot({ path: `${OUT}/sell-${label}-emptied.png` });

  await other.reload(); await wait(2500);
  ok(`${label}: second tab alive`, (await other.locator('.db-problem').count()) === 0);
  ok(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
console.log(`${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
