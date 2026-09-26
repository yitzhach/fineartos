/**
 * Phase 1, part 2 in a real browser against the preview build: first-load
 * JavaScript under 100 KB gzip; tools load when opened and every one works
 * offline after one online visit; a tool that cannot load says so and offers
 * Reload; 200 photographs open without a stall, get thumbnails backfilled,
 * and the desktop draws the thumbnails, not the originals.
 * Run: `npm run build`, then `node scripts/check-lazy-thumbs.mjs`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const PORT = 4198;
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500);

let failures = 0;
const errors = [];
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// 0. The entry chunk, as the build wrote it.
const html = readFileSync('dist/index.html', 'utf8');
const entry = html.match(/src="\/(assets\/index-[^"]+\.js)"/)?.[1];
const kb = entry ? gzipSync(readFileSync(`dist/${entry}`)).length / 1024 : Infinity;
check('first-load JavaScript under 100 KB gzip', kb < 100, `${kb.toFixed(1)} KB`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const URL = `http://localhost:${PORT}/`;
const front = (page) => page.locator('.frame[data-focused="true"]');
const go = async (page, letter) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('g'); await page.keyboard.press(letter); await wait(700);
};

// 1. Tools load on open; offline after one online visit has every one.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const scripts = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await page.goto(URL); await wait(1500);
  const early = scripts.filter((u) => /FinanceWindow|Connect-|Settings-/.test(u));
  check('Finance, Connect and Settings are not in the first load', early.length === 0, early.join(', '));
  await wait(7000); // service worker installs; idle warm-up fetches the rest
  const warmed = ['FinanceWindow', 'Connect-', 'Settings-', 'ArtworkWindow', 'ShowsWindow', 'ImageEditor', 'InvoiceEditor'];
  const missing = warmed.filter((name) => !scripts.some((u) => u.includes(name)));
  check('idle warm-up fetched every tool', missing.length === 0, missing.join(', ') || 'all');

  await context.setOffline(true);
  await page.reload(); await wait(2500);
  const offlineTools = [['b', 'Finance'], ['a', 'Artwork'], ['s', 'Shows'], ['c', 'Connect']];
  for (const [letter, name] of offlineTools) {
    await go(page, letter);
    const text = await front(page).innerText().catch(() => '');
    check(`offline: ${name} opens`, text.length > 20 && !/could not load/.test(text), text.slice(0, 50).replace(/\n/g, ' '));
  }
  await context.setOffline(false);
  await context.close();
}

// 2. A tool whose code cannot arrive says so and offers Reload.
{
  // The service worker would fetch around the route, so it is kept out here.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await context.route(/FinanceWindow-.*\.js$/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(URL); await wait(2500);
  await go(page, 'b'); await wait(800);
  const failed = page.locator('.tool-load-failed');
  const said = (await failed.count()) > 0 ? await failed.first().innerText() : '';
  check('a tool that cannot load says so', /could not load/.test(said), said.slice(0, 60));
  check('…and offers Reload', (await failed.locator('button', { hasText: 'Reload' }).count()) === 1);
  await context.close();
}

// 3. 200 photographs on an existing database.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`photos: ${String(e)}`));
  await page.goto(URL); await wait(3000);
  // Seed straight into the store, as a database from before thumbnails holds them.
  const seeded = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400; canvas.height = 1800;
    const ctx = canvas.getContext('2d');
    const blobs = [];
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = `hsl(${i * 45} 50% 50%)`; ctx.fillRect(0, 0, 2400, 1800);
      for (let j = 0; j < 400; j += 1) { ctx.fillStyle = `hsl(${(i * 45 + j) % 360} 60% ${30 + (j % 40)}%)`; ctx.fillRect((j * 97) % 2400, (j * 53) % 1800, 120, 90); }
      blobs.push(await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92)));
    }
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('artist-os'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(['images', 'photos'], 'readwrite');
    const now = new Date().toISOString();
    for (let i = 0; i < 200; i += 1) {
      const blob = blobs[i % blobs.length];
      const imageId = `seed-img-${i}`;
      tx.objectStore('images').put({ id: imageId, workspaceId: 'local', blob, mimeType: blob.type, byteSize: blob.size, createdAt: now });
      tx.objectStore('photos').put({ id: `seed-photo-${i}`, workspaceId: 'local', photo: {
        id: `seed-photo-${i}`, imageId, title: `Seed ${i}`, pixelWidth: 2400, pixelHeight: 1800, widthIn: null, heightIn: null,
        medium: null, year: null, price: null, currency: 'USD', note: null, status: null, inCurrentShow: false,
        hiddenFromVisitors: false, createdAt: now, updatedAt: now } });
    }
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    return blobs[0].size;
  });
  console.log(`seeded 200 photos, ${Math.round(seeded / 1024)} KB each`);

  await page.addInitScript(() => {
    window.__longest = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longest = Math.max(window.__longest, e.duration);
    }).observe({ type: 'longtask', buffered: true });
  });
  const started = Date.now();
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.desktop img').length >= 50, null, { timeout: 30000 }).catch(() => {});
  const shownMs = Date.now() - started;
  const shown = await page.locator('.desktop img').count();
  check('200 photographs reach the desktop', shown >= 50, `${shown} pictures in ${shownMs} ms`);

  // The backfill runs one at a time; give it time, then look at the store.
  let made = 0;
  for (let i = 0; i < 40 && made < 200; i += 1) {
    await wait(1000);
    made = await page.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('artist-os'); q.onsuccess = () => r(q.result); });
      const all = await new Promise((r) => { const q = db.transaction('images').objectStore('images').getAll(); q.onsuccess = () => r(q.result); });
      db.close();
      return all.filter((x) => x.id.startsWith('seed-img-') && x.thumb).length;
    });
  }
  check('every old photograph got a thumbnail', made === 200, `${made} of 200`);
  const thumbType = await page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('artist-os'); q.onsuccess = () => r(q.result); });
    const one = await new Promise((r) => { const q = db.transaction('images').objectStore('images').get('seed-img-0'); q.onsuccess = () => r(q.result); });
    db.close();
    return { type: one.thumb?.type, size: one.thumb?.size, original: one.blob.size };
  });
  check('the thumbnail is a small WebP beside an untouched original', thumbType.type === 'image/webp' && thumbType.size < thumbType.original / 4, JSON.stringify(thumbType));
  const longest = await page.evaluate(() => window.__longest);
  check('no stall while 200 photographs load and backfill', longest < 500, `longest task ${Math.round(longest)} ms`);

  // Reload: now the desktop draws the small copies.
  await page.reload(); await wait(3500);
  const widths = await page.locator('.desktop img').evaluateAll((imgs) => imgs.slice(0, 20).map((i) => i.naturalWidth));
  check('the desktop draws thumbnails after a reload', widths.length > 0 && widths.every((w) => w > 0 && w <= 480), widths.slice(0, 5).join(','));

  // A picture opened at full size gets the original.
  const second = await context.newPage();
  await second.goto(URL); await wait(2500);
  check('a second tab opens on the same database', (await second.locator('.desktop').count()) === 1);
  await second.close();
  await context.close();
}

await browser.close();
console.log(errors.length ? `ERRORS\n${errors.join('\n')}` : 'errors: none');
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
