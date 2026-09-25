/**
 * Shows, in a real browser, against an existing v5 database with a second
 * tab left open on the old build. OLD_DIST is a build of the commit before.
 *   OLD_DIST=/path/to/old-dist node scripts/check-shows.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4190;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT ?? '/tmp';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const serve = (dir) => {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', ...(dir ? ['--outDir', dir] : [])], { stdio: 'ignore', detached: true });
  const handle = { kill: () => { try { process.kill(-p.pid); } catch {} } };
  servers.push(handle);
  return handle;
};
const log = (...a) => console.log(...a);
const servers = [];
process.on('exit', () => servers.forEach((one) => one.kill()));

let server = serve(process.env.OLD_DIST);
await wait(2500);
const ctx = await chromium.launchPersistentContext(`${OUT}/profile`, { executablePath: CHROME, args: ['--no-sandbox'], viewport: { width: 1440, height: 900 } });
const errors = [];
ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
const old1 = await ctx.newPage();
await old1.goto(URL); await wait(2500);
const old2 = await ctx.newPage();
await old2.goto(URL); await wait(1500);
log('old build loaded, two tabs');

server.kill(); await wait(800);
server = serve(null);
await wait(2500);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => { log('dialog:', d.message()); void d.accept(); });
await page.goto(URL); await wait(4000);
// The old build's service worker answers first, as after any deploy; the
// new build takes over on the next load.
for (let i = 0; i < 3 && !(await page.locator('.dock button[title="Shows"]').count()); i++) {
  await page.reload(); await wait(3500);
}
log('dock:', await page.$$eval('.dock-item', (els) => els.map((e) => e.title).join(', ')));
log('db problem shown:', await page.locator('.db-problem').count());

await page.locator('input[type=file][accept^="image/png"]').setInputFiles('public/icon-512.png'); await wait(2500);
await page.locator('.dock button[title="Shows"]').click(); await wait(800);
const win = page.locator('.frame[data-focused="true"]');
await win.getByLabel('New show name').fill('Autumn Fair');
await win.getByRole('button', { name: 'Add show' }).click(); await wait(800);
await win.locator('#sh-start').fill('2026-10-03');
await win.locator('#sh-status').selectOption('accepted'); await wait(600);
await win.locator('#sh-fee').fill('150');
await win.locator('#sh-venue').click(); await wait(800);
const pieces = await win.locator('.sh-piece').count();
if (pieces) { await win.locator('.sh-piece').first().click(); await wait(800); }
log('pieces offered', pieces, 'taken', await win.locator('.sh-piece[aria-pressed="true"]').count());
await page.screenshot({ path: `${OUT}/shows-desktop.png` });

await page.screenshot({ path: `${OUT}/before-reload.png` });
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await wait(4000);
if (!(await page.locator('.frame[data-focused="true"] .sh-window').count())) {
  await page.locator('.dock button[title="Shows"]').click(); await wait(800);
}
const win2 = page.locator('.frame[data-focused="true"]');
log('after reload list:', (await win2.locator('.sh-list').innerText()).replace(/\n/g, ' | '));
log('fee after reload:', await win2.locator('#sh-fee').inputValue());
await page.locator('.dock button[title="Finance"]').click(); await wait(1200);
log('expense rows:', await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('artist-os');
  r.onsuccess = () => {
    const names = [...r.result.objectStoreNames];
    if (!names.includes('expenses')) return res('dbs: ' + names.join(','));
    const q = r.result.transaction('expenses').objectStore('expenses').getAll();
    q.onsuccess = () => res(JSON.stringify(q.result.map((row) => [row.expense.what, row.expense.amount])));
  };
})));
await page.locator('.frame[data-focused="true"]').getByRole('button', { name: 'Money out' }).click(); await wait(800);
log('books mention booth fee:', (await page.locator('body').innerText()).includes('Booth fee — Autumn Fair'));
await page.locator('.dock button[title="Artwork"]').click(); await wait(1200);
log('artwork says At a show:', (await page.locator('body').innerText()).includes('At a show'));

await page.setViewportSize({ width: 390, height: 844 });
await page.locator('.dock button[title="Shows"]').click().catch(() => {}); await wait(1000);
await page.screenshot({ path: `${OUT}/shows-phone.png` });
log('phone horizontal overflow:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
log('errors:', errors.join(' || ') || 'none');
await ctx.close();
process.exit(0);
