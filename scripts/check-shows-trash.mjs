/**
 * Shows through the Trash and the shows file, in a real browser, with a
 * second tab open.   npm run build && node scripts/check-shows-trash.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 4192;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT ?? '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
await wait(2500);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL); await wait(3000);
const second = await ctx.newPage(); await second.goto(URL); await wait(2000);
await page.bringToFront();
const focused = () => page.locator('.frame[data-focused="true"]');
const dock = (name) => page.locator(`.dock button[title="${name}"]`).click();
const db = (store) => page.evaluate((store) => new Promise((res) => {
  const r = indexedDB.open('artist-os');
  r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); };
}), store);

await page.locator('input[type=file][accept^="image/png"]').setInputFiles('public/icon-512.png'); await wait(2500);
await dock('Shows'); await wait(800);
await focused().getByLabel('New show name').fill('Spring Market');
await focused().getByRole('button', { name: 'Add show' }).click(); await wait(800);
await focused().locator('#sh-status').selectOption('accepted'); await wait(600);
await focused().locator('#sh-fee').fill('80');
await focused().locator('#sh-venue').click(); await wait(800);
await focused().locator('.sh-piece').first().click(); await wait(800);
const location = async () => (await db('photos'))[0]?.photo.location ?? null;
log('piece location after taking:', await location());

const download = page.waitForEvent('download');
await focused().getByRole('button', { name: 'Save shows as a file' }).click();
const file = `${OUT}/shows-export.json`;
await (await download).saveAs(file);
log('file has show:', JSON.parse((await import('node:fs')).readFileSync(file, 'utf8')).shows[0]?.name);

await focused().getByRole('button', { name: 'Move to Trash' }).click(); await wait(1000);
log('list after trash:', (await focused().locator('.sh-list').innerText()).replace(/\n/g, ' | '));
log('fee row kept while in Trash:', (await db('expenses')).length, '· location:', await location());

// Reading the file back while the show is in the Trash adds nothing.
await focused().locator('input[type=file][accept="application/json"]').setInputFiles(file); await wait(1000);
log('message after import:', await page.locator('body').innerText().then((t) => (t.match(/[^\n]*already here[^\n]*/) ?? ['(none)'])[0]));

await dock('Trash'); await wait(800);
await focused().getByRole('button', { name: 'Empty Trash' }).click(); await wait(400);
log('confirm:', await focused().locator('text=/Delete \\d+ records? forever\\?/').first().innerText());
log('detail:', await focused().locator('text=/booth-fee/').first().innerText().catch(() => '(none)'));
await focused().getByRole('button', { name: /Delete \d+ records? forever$/ }).click(); await wait(1500);
log('after empty — shows:', (await db('shows')).length, 'fee rows:', (await db('expenses')).length, 'location:', await location());

// And read back in from the file: the show returns with its fee row.
await dock('Shows'); await wait(800);
await focused().locator('input[type=file][accept="application/json"]').setInputFiles(file); await wait(1200);
log('after re-import — shows:', (await db('shows')).length, 'fee rows:', (await db('expenses')).length);
await second.reload(); await wait(2500);
log('second tab alive, db problem:', await second.locator('.db-problem').count());
log('errors:', errors.join(' || ') || 'none');
await browser.close();
process.exit(0);
