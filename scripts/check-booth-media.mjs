/**
 * Phase 3 part 2 in a real browser: the v7 → v8 upgrade with an old tab left
 * open, the attract-loop video (kept on the device, shown muted in the loop),
 * and the phone dock's shorter row.
 *   OLD_DIST=/path/to/v7-build node scripts/check-booth-media.mjs   (after npm run build)
 * OLD_DIST is a build of origin/main before this change (database version 7).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4196;
const URL = `http://localhost:${PORT}/`;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];
const serve = (dir) => {
  const args = ['vite', 'preview', '--port', String(PORT), '--strictPort', ...(dir ? ['--outDir', dir] : [])];
  const p = spawn('npx', args, { stdio: 'ignore', detached: true });
  servers.push(p);
  return () => { try { process.kill(-p.pid); } catch {} };
};
process.on('exit', () => servers.forEach((p) => { try { process.kill(-p.pid); } catch {} }));
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name); };

// A stand-in clip: enough bytes to be stored and played back as a blob.
const dir = mkdtempSync(join(tmpdir(), 'bm-'));
const clip = join(dir, 'loop.webm');
writeFileSync(clip, Buffer.alloc(4096, 1));

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'p-')), {
  executablePath: CHROME, args: ['--no-sandbox'], viewport: { width: 1024, height: 768 },
});
const errors = [];
const onPage = (pg) => pg.on('pageerror', (e) => errors.push(String(e)));

// 1. The v7 build: a piece on the device, and a second tab left open on it.
let stopOld = serve(process.env.OLD_DIST);
await wait(2500);
const old = await ctx.newPage(); onPage(old);
await old.goto(URL); await wait(4000);
await old.locator('main input[type=file][accept^="image/png"]').setInputFiles('public/icon-512.png'); await wait(2500);
const held = await ctx.newPage(); onPage(held);
await held.goto(URL); await wait(2000);

// 2. The v8 build opens the same database while that tab holds v7.
stopOld();
await wait(1000);
const stopNew = serve(undefined);
await wait(2500);
const fresh = await ctx.newPage(); onPage(fresh);
await fresh.goto(URL); await wait(4000);
// The v7 build closes its own connection when a newer version asks
// (onversionchange), so the upgrade goes through with the old tab still open.
// The app must not hang or show its blocked message while it does.
await wait(4000);
const stuck = await fresh.evaluate(() => /could not be opened|Another tab of Artist OS/.test(document.body.innerText));
ok('upgrade with an old tab open does not hang or say it is blocked', !stuck);

// 3. Close the old tabs and reload; the piece survives.
await held.close(); await old.close();
await fresh.reload(); await wait(4000);
const version = await fresh.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('artist-os');
  r.onsuccess = () => { const db = r.result; const v = db.version; const stores = [...db.objectStoreNames]; db.close(); res({ v, stores }); };
  r.onerror = () => res(null);
}));
ok('database is version 8 and has the booth media shelf', version?.v === 8 && version.stores.includes('boothMedia'));
ok('the piece from v7 is still there (images store)', await fresh.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('artist-os');
  r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').count(); q.onsuccess = () => { r.result.close(); res(q.result >= 1); }; };
  r.onerror = () => res(false);
})));

// 4. The video: chosen in Connect → Booth mode, kept, and shown muted in the loop.
await fresh.keyboard.press('/'); await wait(500);
await fresh.getByRole('option', { name: /^Connect/ }).or(fresh.locator('text=Guest book, sending a picture')).first().click(); await wait(1500);
const win = fresh.locator('.connect').last();
await win.getByRole('button', { name: 'Booth mode' }).click(); await wait(600);
await win.locator('input[type=file][accept="video/mp4,video/webm"]').setInputFiles(clip); await wait(1200);
ok('video saved and shown in setup', (await win.locator('video.booth-setup-video').count()) === 1);
await win.getByPlaceholder('New PIN').fill('4821');
await win.getByPlaceholder('Again').fill('4821');
await win.getByRole('button', { name: 'Set PIN' }).click(); await wait(500);
await win.getByRole('button', { name: 'Start booth mode' }).click(); await wait(1500);
const loopVideo = fresh.locator('.booth-loop video.booth-slide');
ok('the loop plays the video, muted, looping', (await loopVideo.count()) === 1 && (await loopVideo.evaluate((v) => v.muted && v.loop && v.src.startsWith('blob:'))));
// Guest book: 3.5 s with no touch goes back to the loop, with no PIN, and says so.
await fresh.locator('.booth-loop').click(); await wait(300);
ok('guest book is up after a tap', (await fresh.locator('.booth-tabs').count()) === 1);
await wait(4500);
ok('quiet for 3.5 s: back to the loop, "(timed out)" shown', (await fresh.locator('.booth-loop').count()) === 1 && (await fresh.locator('.booth-timeout').innerText()).includes('(timed out)'));
// The same return by hand, from the tab bar, with no timeout note.
await fresh.locator('.booth-loop').click(); await wait(300);
await fresh.getByRole('button', { name: 'Back to the loop' }).click(); await wait(400);
ok('"Back to the loop" returns without a note', (await fresh.locator('.booth-loop').count()) === 1 && (await fresh.locator('.booth-timeout').count()) === 0);
await fresh.locator('.booth-loop').click(); await wait(400);
await fresh.getByRole('button', { name: /Artist/ }).click();
for (const d of '4821') await fresh.locator('.booth-keys button', { hasText: d }).first().click();
await fresh.locator('.booth-keys button', { hasText: 'OK' }).click(); await wait(1500);

// 5. Kept across a reload.
await fresh.reload(); await wait(4000);
await fresh.keyboard.press('/'); await wait(500);
await fresh.getByRole('option', { name: /^Connect/ }).or(fresh.locator('text=Guest book, sending a picture')).first().click(); await wait(1500);
await fresh.locator('.connect').last().getByRole('button', { name: 'Booth mode' }).click(); await wait(600);
ok('video still there after a reload', (await fresh.locator('.connect').last().locator('video.booth-setup-video').count()) === 1);

// 6. The phone dock: a short row; the full set is one search away.
await fresh.setViewportSize({ width: 390, height: 844 }); await wait(800);
const phoneItems = await fresh.locator('.dock .dock-item').count();
ok(`phone dock shows a short row (${phoneItems})`, phoneItems > 0 && phoneItems <= 7);
await fresh.setViewportSize({ width: 1024, height: 768 }); await wait(800);
const tabletItems = await fresh.locator('.dock .dock-item').count();
ok(`tablet dock keeps the full set (${tabletItems})`, tabletItems > phoneItems);

ok(`no page errors ${errors.join(' ')}`, errors.length === 0);
await ctx.close();
stopNew();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
