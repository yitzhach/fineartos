/**
 * Phase 3 booth mode in a real browser: tablet and phone, offline after the
 * first load, a second tab open. Loop → tap → sign → QR → wrong PIN → reload
 * stays in the booth → right PIN out, and the guest is in the book.
 *   node scripts/check-booth.mjs   (after npm run build)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4193;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT ?? '/tmp';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
await wait(2500);
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name); };

for (const [label, viewport] of [['tablet', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'b-')), { executablePath: CHROME, args: ['--no-sandbox'], viewport });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL); await wait(5000); // service worker installs, tools warm up
  const other = await ctx.newPage(); await other.goto(URL); await wait(1500);
  await page.bringToFront();

  await page.evaluate(() => localStorage.setItem('artistOS.booth', JSON.stringify({ statement: 'I paint rivers.' })));
  await page.reload(); await wait(3000);
  await ctx.setOffline(true);
  await page.keyboard.press('/'); await wait(500);
  await page.getByRole('option', { name: /^Connect/ }).or(page.locator('text=Guest book, sending a picture')).first().click(); await wait(1500);
  await page.screenshot({ path: `${OUT}/booth-${label}-connect.png` });
  const win = page.locator('.connect').last();
  await win.getByRole('button', { name: 'Booth mode' }).click(); await wait(600);
  ok(`${label}: start disabled without PIN`, await win.getByRole('button', { name: 'Start booth mode' }).isDisabled());
  await win.getByPlaceholder('New PIN').fill('4821');
  await win.getByPlaceholder('Again').fill('4821');
  await win.getByRole('button', { name: 'Set PIN' }).click(); await wait(500);
  await win.getByRole('button', { name: 'Start booth mode' }).click(); await wait(1500);
  ok(`${label}: loop up, studio gone`, (await page.locator('.booth-loop').count()) === 1 && (await page.locator('.dock').count()) === 0);
  await page.screenshot({ path: `${OUT}/booth-${label}-loop.png` });

  await page.locator('.booth-loop').click(); await wait(600);
  const tabs = await page.locator('.booth-tabs [role=tab]').allInnerTexts();
  ok(`${label}: panels ${tabs.join('/')}`, tabs.includes('About the artist') && tabs.includes('Take my details') && !tabs.includes('Website'));
  await page.getByLabel('Name').fill('Ada Visitor');
  await page.getByLabel(/Email/).fill('ada@example.com');
  await page.getByRole('button', { name: 'Sign' }).click(); await wait(600);
  ok(`${label}: thanks shown`, (await page.locator('.booth-thanks').count()) === 1);
  await page.screenshot({ path: `${OUT}/booth-${label}-thanks.png` });
  await page.getByRole('tab', { name: 'Take my details' }).click(); await wait(800);
  ok(`${label}: QR drawn`, (await page.locator('.booth-qr canvas').count()) >= 1);
  await page.keyboard.press('Control+k'); await wait(400);
  ok(`${label}: shell keys held back`, (await page.locator('.launcher, [role=dialog][aria-label*="earch"]').count()) === 0);

  await page.getByRole('button', { name: /Artist/ }).click();
  for (const d of '1111') await page.locator('.booth-keys button', { hasText: d }).first().click();
  await page.locator('.booth-keys button', { hasText: 'OK' }).click(); await wait(500);
  ok(`${label}: wrong PIN refused`, (await page.locator('.booth-pin').innerText()).includes('not the PIN'));
  await page.reload(); await wait(3500);
  ok(`${label}: reload stays in booth (offline)`, (await page.locator('.booth').count()) === 1);
  await page.locator('.booth-loop').click(); await wait(400);
  await page.getByRole('button', { name: /Artist/ }).click();
  for (const d of '4821') await page.locator('.booth-keys button', { hasText: d }).first().click();
  await page.locator('.booth-keys button', { hasText: 'OK' }).click(); await wait(1500);
  ok(`${label}: right PIN out`, (await page.locator('.booth').count()) === 0);
  const guests = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('artist-os');
    r.onsuccess = () => { const q = r.result.transaction('guests').objectStore('guests').getAll(); q.onsuccess = () => res(JSON.stringify(q.result)); };
    r.onerror = () => res('err');
  }));
  ok(`${label}: guest stored`, guests.includes('Ada Visitor'));
  ok(`${label}: no page errors ${errors.join(' ')}`, errors.length === 0);
  await ctx.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
