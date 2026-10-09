/**
 * Phase 5 mailing list in a real browser, desktop and phone, second tab open.
 * The gate: a show's sign-ups become a segment exported in one step. Also the
 * Connect tab's segments, the BCC draft, and a QR tagged with the show.
 *   npm run build && node scripts/check-mailing.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4196;
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
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'm-')), { executablePath: CHROME, args: ['--no-sandbox'], viewport, acceptDownloads: true });
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
  const download = async (click) => {
    const d = page.waitForEvent('download');
    await click();
    const file = await d;
    const path = join(OUT, `${label}-${file.suggestedFilename()}`);
    await file.saveAs(path);
    return { name: file.suggestedFilename(), text: readFileSync(path, 'utf8') };
  };

  await open('Shows');
  await focused().getByLabel('New show name').fill('Spring Market');
  await focused().getByRole('button', { name: 'Add show' }).click(); await wait(600);
  await focused().locator('#sh-start').fill(new Date().toISOString().slice(0, 10)); await wait(400);

  // Guests and two client profiles, written as the app stores them.
  await page.evaluate(() => new Promise((res) => {
    const g = (id, name, email, show, consented, likes = []) => ({ id, workspaceId: 'local', guest: {
      id, name, email, phone: null, show, note: null, consented, likedPhotoIds: likes, signaturePaths: null, signedAt: `2026-10-0${id.length}T10:00:00Z` } });
    const prof = (id, keys, label, over) => ({ id, workspaceId: 'local', profile: {
      id, keys, name: null, label, tags: [], followUp: null, note: null, notSame: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over } });
    const r = indexedDB.open('artist-os');
    r.onsuccess = () => {
      const tx = r.result.transaction(['guests', 'clients'], 'readwrite');
      const gs = tx.objectStore('guests'), cs = tx.objectStore('clients');
      gs.put(g('a', 'Ana Ruiz', 'ana@example.com', 'Spring Market', true));
      gs.put(g('bb', 'Bo No', 'bo@example.com', 'Spring Market', false));
      gs.put(g('ccc', 'Cy Ode', 'cy@example.com', 'Autumn Fair', true));
      gs.put(g('dddd', 'Di Phone', null, 'Spring Market', true));
      cs.put(prof('p1', ['email:cy@example.com'], 'Cy Ode', { tags: ['collector'] }));
      cs.put(prof('p2', ['email:ed@example.com'], 'Ed Client', { mayEmail: true }));
      cs.put(prof('p3', ['email:fay@example.com'], 'Fay Unasked', {}));
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }));
  await page.reload(); await wait(3000);

  // The gate: one tap from the show.
  await open('Shows');
  await focused().locator('.sh-list button', { hasText: 'Spring Market' }).click(); await wait(500);
  const btn = focused().getByRole('button', { name: /Export sign-ups \(\d+\)/ });
  ok(`${label}: show offers its 1 consenting sign-up of 3`, (await btn.innerText()).includes('(1)') && (await focused().innerText()).includes('2 did not say yes or gave no email'));
  const showCsv = await download(() => btn.click());
  ok(`${label}: one step → CSV with only Ana`, showCsv.name === 'mailing-list-signed-in-at-spring-market.csv' && showCsv.text === '"email","first_name","last_name","tags"\r\n"ana@example.com","Ana","Ruiz","Spring Market"', JSON.stringify(showCsv));

  // Connect → Mailing list.
  await open('Connect');
  await focused().getByRole('button', { name: 'Mailing list', exact: true }).click(); await wait(600);
  const ml = focused().locator('.ml');
  let text = await ml.innerText();
  ok(`${label}: list = Ana, Cy, Ed (not Bo, Di, Fay)`, /3 people · everyone/.test(text) && text.includes('ed@example.com') && !text.includes('bo@example.com') && !text.includes('fay@example.com'));
  await ml.locator('select').first().selectOption('Spring Market'); await wait(300);
  ok(`${label}: show segment → 1`, /1 person · signed in at Spring Market/.test(await ml.innerText()));
  await ml.locator('select').first().selectOption(''); await wait(200);
  await ml.getByLabel('Tag').selectOption('collector'); await wait(300);
  ok(`${label}: tag segment → Cy`, /1 person · tagged collector/.test(await ml.innerText()) && (await ml.innerText()).includes('cy@example.com'));
  const tagCsv = await download(() => ml.getByRole('button', { name: 'Export CSV' }).click());
  ok(`${label}: tag CSV`, tagCsv.text.includes('"cy@example.com","Cy","Ode","Autumn Fair, collector"'));
  await ml.getByLabel('Tag').selectOption(''); await wait(200);
  await ml.getByLabel('Subject').fill('New work');
  await ml.getByLabel('Message').fill('Come see it.');
  const href = await ml.getByRole('link', { name: 'Open in my mail app' }).getAttribute('href');
  ok(`${label}: BCC draft to all 3`, href.startsWith('mailto:?bcc=') && decodeURIComponent(href).includes('ana@example.com,cy@example.com,ed@example.com'));
  ok(`${label}: never claims to send`, !/\bsent\b/i.test((await ml.innerText()).replace('Nothing is sent from here', '')));
  await page.screenshot({ path: `${OUT}/mail-${label}.png` });

  // QR tagged with the show.
  await focused().getByRole('button', { name: /QR/ }).first().click(); await wait(500);
  await focused().getByRole('button', { name: 'Web address' }).click();
  await focused().locator('#qr-url').fill('studio.example');
  await focused().locator('#qr-show').selectOption('Spring Market'); await wait(500);
  const png = await download(() => focused().getByRole('button', { name: 'Save QR as PNG' }).click());
  ok(`${label}: QR file named for the show`, png.name === 'qr-spring-market.png');
  const decoded = await page.evaluate(() => document.querySelector('.qr-plate canvas') !== null);
  ok(`${label}: QR drawn`, decoded);

  await other.reload(); await wait(2500);
  ok(`${label}: second tab alive`, (await other.locator('.db-problem').count()) === 0);
  ok(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
console.log(`${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
