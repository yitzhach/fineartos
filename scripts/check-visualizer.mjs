/**
 * Phase 4 Visualizer in a real browser, desktop and phone, a second tab open:
 * a picture given a size, a room photo, four corners + wall size, the piece
 * placed and dragged (touch on the phone), the light slider; then a known
 * length instead; a piece with no size is left out, never guessed.
 *   ROOM=/path/room.jpg node scripts/check-visualizer.mjs   (after npm run build)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4194;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT ?? '/tmp';
const ROOM = process.env.ROOM ?? 'public/icon-512.png';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
await wait(2500);
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name); };

for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 860 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'v-')), {
    executablePath: CHROME, args: ['--no-sandbox'], viewport, hasTouch: touch, isMobile: touch,
  });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL); await wait(5000);
  const other = await ctx.newPage(); await other.goto(URL); await wait(1500);
  await page.bringToFront();

  // Two pictures: one is given a size, the other stays unsized.
  await page.locator('main input[type=file][accept^="image/png"]').setInputFiles(['public/icon-512.png', 'public/icon-192.png']); await wait(3000);
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('artist-os');
    r.onsuccess = () => {
      const tx = r.result.transaction('photos', 'readwrite');
      const s = tx.objectStore('photos');
      s.getAll().onsuccess = (e) => {
        const row = e.target.result.sort((a, b) => a.id.localeCompare(b.id))[0];
        s.put({ ...row, photo: { ...row.photo, title: 'River piece', widthIn: 24, heightIn: 36 } });
      };
      tx.oncomplete = () => { r.result.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
  }));
  await page.reload(); await wait(3000);
  await page.keyboard.press('/'); await wait(400);
  await page.getByRole('option', { name: /^Visualizer/ }).click(); await wait(2000);
  await page.screenshot({ path: `${OUT}/viz-${label}-open.png` });
  const win = page.locator('.viz').last();
  ok(`${label}: Visualizer window opens (not the preview)`, await win.isVisible());
  ok(`${label}: no mock "Preview" text`, !(await page.locator('.frame[data-focused="true"]').innerText()).includes('nothing here saves'));

  await win.locator('input[type=file]').setInputFiles(ROOM); await wait(1200);
  const stage = win.locator('.viz-stage');
  ok(`${label}: room photo shown`, await stage.isVisible());
  await stage.scrollIntoViewIfNeeded();
  let box = await stage.boundingBox();
  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const tap = async (pt) => (touch ? page.touchscreen.tap(pt.x, pt.y) : page.mouse.click(pt.x, pt.y));
  for (const [fx, fy] of [[0.17, 0.13], [0.83, 0.2], [0.82, 0.75], [0.18, 0.8]]) { await tap(at(fx, fy)); await wait(150); }
  ok(`${label}: four corner marks`, (await win.locator('.viz-mark').count()) === 4);
  ok(`${label}: asks for wall size, no piece list yet`, (await win.innerText()).includes("Say the wall's real width and height") && (await win.locator('select').count()) === 0);
  await win.getByLabel('Wall width (in)').fill('144');
  await win.getByLabel('Wall height (in)').fill('96'); await wait(300);
  ok(`${label}: unsized piece left out, said so`, (await win.innerText()).includes('1 piece has no size recorded'));
  await win.locator('select').selectOption({ label: 'River piece — 24 × 36 in' }); await wait(800);
  const piece = win.locator('.viz-piece');
  ok(`${label}: piece placed`, await piece.isVisible());
  const t1 = await piece.evaluate((el) => getComputedStyle(el).transform);
  ok(`${label}: piece follows the wall (matrix3d)`, t1.startsWith('matrix3d'));
  const pb = await piece.boundingBox();
  // On the marked wall 144 in wide, a 24 in piece is about a sixth of the wall's span.
  const ratio = pb.width / (box.width * 0.65);
  ok(`${label}: piece ~ true size on the wall (${ratio.toFixed(3)})`, ratio > 0.12 && ratio < 0.22);
  ok(`${label}: light filter applied`, (await piece.evaluate((el) => el.style.filter)).includes('brightness'));
  await page.screenshot({ path: `${OUT}/viz-${label}-corners.png` });

  // Drag the piece to the right.
  const c = { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 };
  if (touch) {
    const cdp = await ctx.newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(c.x, c.y) });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(c.x + i * 8, c.y) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(c.x + i * 15, c.y);
    await page.mouse.up();
  }
  await wait(300);
  const pb2 = await piece.boundingBox();
  ok(`${label}: drag moves the piece right (${(pb2.x - pb.x).toFixed(0)}px)`, pb2.x - pb.x > 20);

  await win.locator('input[type=range]').fill('0'); await wait(200);
  ok(`${label}: light at 0% leaves the piece as is`, /^brightness\(1(\.0+)?\)$/.test(await piece.evaluate((el) => el.style.filter)));

  // A known length instead.
  await win.getByRole('radio', { name: 'A known length' }).click(); await wait(300);
  ok(`${label}: switching mode clears the marks`, (await win.locator('.viz-mark').count()) === 0 && (await piece.count()) === 0);
  box = await stage.boundingBox();
  await tap(at(0.2, 0.5)); await wait(150); await tap(at(0.8, 0.5)); await wait(150);
  await win.getByLabel('Marked length (in)').fill('120'); await wait(300);
  await win.locator('select').selectOption({ label: 'River piece — 24 × 36 in' }); await wait(500);
  const pb3 = await piece.boundingBox();
  const r2 = pb3.width / (box.width * 0.6);
  ok(`${label}: known length → 24 in is a fifth of 120 in (${r2.toFixed(3)})`, Math.abs(r2 - 0.2) < 0.02);
  await page.screenshot({ path: `${OUT}/viz-${label}-length.png` });

  ok(`${label}: no page errors ${errors.join(' | ')}`, errors.length === 0);
  await ctx.close();
}
console.log(`${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
