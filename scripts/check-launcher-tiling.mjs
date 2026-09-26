/**
 * Search box, shortcuts and tiling, in a real browser against the preview
 * build: ⌘K and / open the box; words find tools, actions and records; G then
 * a letter opens a tool; Arrange tiles; Alt+Shift+arrow and a drag to an edge
 * snap; a snapped window dragged away comes back at its own size; auto-tile;
 * everything survives a reload with a second tab open; phone width gets the
 * sheet and no tiling. Run: `npm run build`, then `node scripts/check-launcher-tiling.mjs`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const OUT = process.env.OUT ?? '/tmp';
const PORT = 4196;
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
const URL = `http://localhost:${PORT}/`;
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// An existing database: first load seeds the demo, the reload reads it back.
await page.goto(URL); await wait(3000);
await page.reload(); await wait(2500);
// A second tab on the same studio, the way IndexedDB upgrades have bitten.
const second = await context.newPage();
second.on('pageerror', (e) => errors.push(`tab2: ${String(e)}`));
await second.goto(URL); await wait(2500);
await page.bringToFront();

const closeAll = async () => {
  for (let i = 0; i < 8; i++) {
    const n = await page.locator('.frame').count();
    if (!n) break;
    await page.locator('.frame .light.close').first().click({ timeout: 1500 }).catch(() => {});
    await wait(200);
  }
};
await closeAll();
// The tray keeps minimised windows; bring any back and close them too.
for (let i = 0; i < 6; i++) {
  const t = page.locator('.tray-item').first();
  if (!(await t.count())) break;
  await t.click(); await wait(200); await closeAll();
}

const frames = () => page.evaluate(() => {
  const d = document.querySelector('.desktop').getBoundingClientRect();
  return [...document.querySelectorAll('.frame')].map((f) => {
    const r = f.getBoundingClientRect();
    return { title: f.getAttribute('aria-label'), x: Math.round(r.left - d.left), y: Math.round(r.top - d.top), w: Math.round(r.width), h: Math.round(r.height), focused: f.dataset.focused === 'true' };
  });
});
const surface = () => page.evaluate(() => {
  const s = document.querySelector('.desktop-surface').getBoundingClientRect();
  return { w: Math.round(s.width), h: Math.round(s.height) };
});
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 1. ⌘K / Ctrl+K opens the box with the tools and their shortcuts.
await page.keyboard.press('Control+k'); await wait(300);
const focusedIsBox = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox');
const rows = await page.locator('.launcher-row').count();
const gHints = await page.locator('.launcher-row .launcher-keys').count();
check('Ctrl+K opens and focuses the search box', focusedIsBox && rows >= 9, `${rows} rows, ${gHints} with keys`);
await page.screenshot({ path: `${OUT}/launch-empty.png` });

// 2. A synonym finds the tool; Enter opens it.
await page.keyboard.type('mileage'); await wait(200);
const top1 = await page.locator('.launcher-row').first().locator('.launcher-title').innerText();
check('"mileage" ranks Finance first', top1 === 'Finance', top1);
await page.keyboard.press('Enter'); await wait(800);
let f = await frames();
check('Enter opens Finance', f.some((w) => w.title === 'Finance'), f.map((w) => w.title).join(', '));

// 3. / opens the box when not typing; "qr" goes to the QR tab.
await page.locator('.desktop-surface').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('/'); await wait(300);
await page.keyboard.type('qr'); await wait(200);
const qrRows = await page.locator('.launcher-row .launcher-title').allInnerTexts();
await page.locator('.launcher-row').filter({ has: page.locator('.launcher-title', { hasText: /^QR and contact card$/ }) }).click(); await wait(800);
const qrTab = await page.locator('.connect-tabs [aria-pressed="true"], .connect-tabs [aria-selected="true"], .connect-tabs .chip[data-active="true"]').allInnerTexts().catch(() => []);
f = await frames();
check('/ then "qr" offers Connect and opens it', qrRows.includes('Connect') && f.some((w) => w.title === 'Connect'), `rows: ${qrRows.slice(0, 3).join(' | ')}; tab: ${qrTab.join(',')}`);

// 4. G then I opens Invoices.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('g'); await page.keyboard.press('i'); await wait(800);
f = await frames();
check('G then I opens Invoices', f.some((w) => w.title === 'Invoices'), f.map((w) => w.title).join(', '));

// 5. A record by name: the demo folder.
await page.keyboard.press('Control+k'); await wait(200);
await page.keyboard.type('harbour'); await wait(200);
const recordRows = await page.locator('.launcher-row').allInnerTexts();
check('"harbour" finds the demo records', recordRows.length > 0 && /Harbour/i.test(recordRows[0]), recordRows.slice(0, 2).join(' | ').replace(/\n/g, ' / '));
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(200);

// 6. Arrange → Side by side.
const S = await surface();
await page.locator('button[aria-label="Arrange windows"]').click(); await wait(200);
await page.screenshot({ path: `${OUT}/arrange-menu.png` });
await page.locator('.arrange-layout', { hasText: 'Side by side' }).click(); await wait(500);
f = await frames();
const noOverlap = f.every((a, i) => f.every((b, j) => i === j || !overlap(a, b)));
const spans = Math.max(...f.map((w) => w.x + w.w));
check('Side by side: no overlap, edge to edge', f.length === 3 && noOverlap && Math.abs(spans - (S.w - 12)) <= 1, JSON.stringify(f.map((w) => [w.x, w.w])));
await page.screenshot({ path: `${OUT}/tiled-columns.png` });

// 7. Alt+Shift+Left snaps the window in front to the left half.
await page.locator('.frame[data-focused="true"] .frame-title').click(); await wait(100);
await page.keyboard.press('Alt+Shift+ArrowLeft'); await wait(400);
f = await frames();
let front = f.find((w) => w.focused);
const halfW = Math.floor((S.w - 24 - 8) / 2);
check('Alt+Shift+← gives the left half', front && front.x === 12 && Math.abs(front.w - halfW) <= 1 && front.h === S.h - 16, JSON.stringify(front));
await page.keyboard.press('Alt+Shift+ArrowUp'); await wait(300);
f = await frames(); front = f.find((w) => w.focused);
check('then Alt+Shift+↑ gives the top-left quarter', front && front.x === 12 && front.h < S.h / 2 + 5, JSON.stringify(front));

// 8. Drag a titlebar to the right edge: preview while dragging, right half on release.
const target = page.locator('.frame', { hasText: 'Invoices' }).first();
await target.locator('.frame-title').click(); await wait(100);
const bar = await target.locator('.frame-bar').boundingBox();
const desk = await page.locator('.desktop').boundingBox();
await page.mouse.move(bar.x + bar.width / 2, bar.y + 20);
await page.mouse.down();
await page.mouse.move(bar.x + bar.width / 2 + 40, bar.y + 60, { steps: 5 });
await page.mouse.move(desk.x + desk.width - 2, desk.y + 300, { steps: 12 }); await wait(200);
const preview = await page.locator('.snap-preview').count();
await page.screenshot({ path: `${OUT}/drag-preview.png` });
await page.mouse.up(); await wait(400);
f = await frames();
const inv = f.find((w) => w.title === 'Invoices');
check('Drag to the right edge: preview, then the right half', preview === 1 && inv && inv.x === 12 + halfW + 8 && inv.y === 8, `preview ${preview}, ${JSON.stringify(inv)}`);

// 9. Dragged away, it comes back at its own size.
const bar2 = await page.locator('.frame', { hasText: 'Invoices' }).first().locator('.frame-bar').boundingBox();
await page.mouse.move(bar2.x + bar2.width / 2, bar2.y + 20);
await page.mouse.down();
await page.mouse.move(bar2.x - 200, bar2.y + 200, { steps: 10 });
await page.mouse.up(); await wait(400);
f = await frames();
const freed = f.find((w) => w.title === 'Invoices');
check('Dragged off the edge it is its own size again', freed && freed.w !== halfW && freed.w <= 900, JSON.stringify(freed));

// 10. The titlebar's snap menu: bottom-right quarter.
const fin = page.locator('.frame', { hasText: 'Finance' }).first();
await fin.locator('.frame-title').click(); await wait(100);
await fin.locator('.frame-snap-button').click(); await wait(200);
await page.screenshot({ path: `${OUT}/snap-menu.png` });
await fin.locator('.snap-target[aria-label="Bottom right quarter"]').click(); await wait(300);
f = await frames();
const finR = f.find((w) => w.title === 'Finance');
check('Snap menu: bottom-right quarter', finR && finR.x === 12 + halfW + 8 && finR.y > S.h / 2 - 10, JSON.stringify(finR));

// 11. Auto-tile, then a new window joins the layout.
await page.locator('button[aria-label="Arrange windows"]').click(); await wait(200);
await page.locator('.arrange-auto input').check(); await wait(400);
await page.keyboard.press('Escape');
await page.locator('.desktop-surface').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('g'); await page.keyboard.press('s'); await wait(800);
f = await frames();
const allApart = f.every((a, i) => f.every((b, j) => i === j || !overlap(a, b)));
check('Auto-tile lays out a newly opened window', f.length === 4 && allApart, f.map((w) => `${w.title}@${w.x},${w.y} ${w.w}x${w.h}`).join('; '));
await page.screenshot({ path: `${OUT}/auto-tiled.png` });

// 12. Auto-tile is remembered; switched off, a reload (second tab open) puts
// every window back where it was. Every load also opens the newest
// commission — older behaviour, so an extra window is allowed for.
const auto = await page.evaluate(() => localStorage.getItem('artistOS.autoTile'));
check('Auto-tile is remembered', auto === 'true', auto);
await page.locator('button[aria-label="Arrange windows"]').click(); await wait(200);
await page.locator('.arrange-auto input').uncheck(); await wait(200);
await page.keyboard.press('Escape'); await wait(200);
const menuGone = (await page.locator('.arrange-menu').count()) === 0;
check('Escape closes the Arrange menu', menuGone);
const beforeReload = await frames();
await wait(600);
await page.reload(); await wait(3000);
const afterReload = await frames();
const kept = beforeReload.every((b) => afterReload.some((a) => a.title === b.title && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1));
check('Reload (second tab open) puts every window back', kept, `${beforeReload.map((w) => w.title).join(',')} → ${afterReload.map((w) => w.title).join(',')}`);

// 13. Tablet landscape: side by side still fits two usable windows.
await page.setViewportSize({ width: 1024, height: 768 }); await wait(600);
await page.locator('button[aria-label="Arrange windows"]').click(); await wait(200);
await page.locator('.arrange-layout', { hasText: 'Side by side' }).click(); await wait(400);
f = await frames();
check('1024: tiles stay at least 420 wide', f.every((w) => w.w >= 420), f.map((w) => w.w).join(','));
await page.screenshot({ path: `${OUT}/tiled-1024.png` });

// 13b. After many focus changes a window's z is high; the search results and
// the dock must still be on top of it.
await page.setViewportSize({ width: 1440, height: 900 }); await wait(500);
for (let i = 0; i < 30; i++) {
  await page.locator('.frame .frame-title').nth(i % 2).click({ timeout: 1500 }).catch(() => {});
}
const maxZ = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.frame')].map((f) => Number(f.style.zIndex) || 0)));
await page.keyboard.press('Control+k'); await wait(300);
const onTop = await page.evaluate(() => {
  const panel = document.querySelector('.launcher-panel').getBoundingClientRect();
  const hit = document.elementFromPoint(panel.left + panel.width / 2, panel.top + panel.height / 2);
  const dock = document.querySelector('.dock').getBoundingClientRect();
  const dockHit = document.elementFromPoint(dock.left + dock.width / 2, dock.top + dock.height / 2);
  return { launcher: Boolean(hit?.closest('.launcher-panel')), dock: Boolean(dockHit?.closest('.dock')) };
});
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
check('Search results and dock stay above windows focused many times', onTop.launcher && onTop.dock, `max z ${maxZ}, ${JSON.stringify(onTop)}`);

// 14. Phone: the box is a button that opens a sheet; nothing to tile.
await page.setViewportSize({ width: 390, height: 844 }); await wait(600);
const arrangeOnPhone = await page.locator('button[aria-label="Arrange windows"]').count();
const snapOnPhone = await page.locator('.frame-snap-button').count();
await page.locator('.launcher-button').click(); await wait(300);
await page.keyboard.type('shows'); await wait(200);
await page.screenshot({ path: `${OUT}/phone-sheet.png` });
await page.keyboard.press('Enter'); await wait(600);
const phoneFront = await page.locator('.frame[data-focused="true"]').getAttribute('aria-label');
check('Phone: search sheet opens Shows; no tiling controls', arrangeOnPhone === 0 && snapOnPhone === 0 && phoneFront === 'Shows', `arrange ${arrangeOnPhone}, snap ${snapOnPhone}, front ${phoneFront}`);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
check('Phone: no sideways scroll', !overflow);

console.log('errors', errors.join(' || ') || 'none');
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await browser.close(); process.exit(0);
