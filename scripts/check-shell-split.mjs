/**
 * Phase 1, part 1 in a real browser against the preview build: the shell
 * split into hooks behaves as before; a save writes one record instead of
 * re-reading every store; the newest commission opens only when no windows
 * came back; key names follow the platform; ? opens the shortcut sheet.
 * Existing database, second tab, phone width.
 * Run: `npm run build`, then `node scripts/check-shell-split.mjs`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const OUT = process.env.OUT ?? '/tmp';
const PORT = 4197;
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const URL = `http://localhost:${PORT}/`;
const errors = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Counts every full read of a store: the repository lists through the
// workspace index's getAll.
const COUNT_READS = () => {
  window.__reads = 0;
  const original = IDBIndex.prototype.getAll;
  IDBIndex.prototype.getAll = function (...args) {
    window.__reads += 1;
    return original.apply(this, args);
  };
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(COUNT_READS);
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
const titles = () => page.locator('.frame').evaluateAll((fs) => fs.map((f) => f.getAttribute('aria-label')));

// 1. First visit: nothing to put back, so the newest commission opens.
await page.goto(URL); await wait(3000);
let t = await titles();
check('first visit opens the newest commission', t.length === 1 && t[0] === 'Commission Studio', t.join(', '));

// 2. A save writes one record and reads nothing back.
const front = page.locator('.frame[data-focused="true"]');
await front.locator('button', { hasText: /^Details$/ }).first().click(); await wait(400);
const title = front.locator('#doc-title');
const readsBefore = await page.evaluate(() => window.__reads);
await title.fill('Harbour triptych, revised'); await wait(800);
const readsAfter = await page.evaluate(() => window.__reads);
check('typing into a commission re-reads no store', readsAfter === readsBefore, `${readsAfter - readsBefore} list reads`);
await page.keyboard.press('Control+k'); await wait(200);
await page.keyboard.type('revised'); await wait(200);
const found = await page.locator('.launcher-row .launcher-title').allInnerTexts();
check('the edit reaches the search box without a reload', found.some((x) => /revised/.test(x)), found.slice(0, 2).join(' | '));
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(200);

// 3. Open Finance too, close the commission, reload: only Finance comes back.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('g'); await page.keyboard.press('b'); await wait(600);
await page.locator('.frame[aria-label="Commission Studio"] .light.close').click(); await wait(700);
await page.reload(); await wait(3000);
t = await titles();
check('a reload puts back what was open and adds nothing', t.length === 1 && t[0] === 'Finance', t.join(', '));
// The commission sits inside the demo folder, so ask the search box for it.
await page.keyboard.press('Control+k'); await wait(200);
await page.keyboard.type('revised'); await wait(200);
const afterReload = await page.locator('.launcher-row .launcher-title').allInnerTexts();
check('the edit survived the reload', afterReload.some((x) => /revised/.test(x)), afterReload.slice(0, 1).join());
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(200);

// 4. Second tab on the same database.
const second = await context.newPage();
second.on('pageerror', (e) => errors.push(`tab2: ${String(e)}`));
await second.goto(URL); await wait(3000);
const secondTitles = await second.locator('.frame').evaluateAll((fs) => fs.map((f) => f.getAttribute('aria-label')));
check('a second tab opens on the same arrangement', secondTitles.join() === 'Finance', secondTitles.join(', '));
await page.bringToFront();

// 5. Close everything and reload: nothing came back, so the newest opens.
await page.locator('.frame .light.close').first().click(); await wait(700);
await page.reload(); await wait(3000);
t = await titles();
check('with nothing to put back, the newest commission opens', t.join() === 'Commission Studio', t.join(', '));

// 6. Key names: this is Linux, so Ctrl.
await page.locator('.frame .light.close').first().click(); await wait(400);
await page.locator('button', { hasText: /^Tidy up$/ }).first().click(); await wait(400);
const notice = await page.locator('.notice').first().innerText().catch(() => '');
check('the tidy message names Ctrl+Z off a Mac', /Ctrl\+Z puts it back/.test(notice) && !notice.includes('⌘'), notice.split('\n')[0]);

// 7. ? opens the sheet; Escape closes it; the search box finds it.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Shift+?'); await wait(300);
let sheet = page.locator('.shortcuts[role="dialog"]');
const sheetText = await sheet.innerText().catch(() => '');
check('? opens the shortcut sheet', (await sheet.count()) === 1 && sheetText.includes('Ctrl') && !/[⌘⌥]/.test(sheetText), sheetText.split('\n').slice(0, 3).join(' / '));
await page.screenshot({ path: `${OUT}/shortcuts-pc.png` });
await page.keyboard.press('g'); await page.keyboard.press('b'); await wait(400);
check('the sheet holds the keys while it is open', (await titles()).length === 0);
await page.keyboard.press('Escape'); await wait(300);
check('Escape closes it', (await sheet.count()) === 0);
await page.keyboard.press('Control+k'); await wait(200);
await page.keyboard.type('shortcuts'); await wait(200);
await page.locator('.launcher-row', { hasText: 'Keyboard shortcuts' }).first().click(); await wait(300);
check('"shortcuts" in the search box opens the sheet', (await sheet.count()) === 1);
await page.locator('.shortcuts-scrim').click({ position: { x: 5, y: 5 } }); await wait(300);
check('a click outside closes it', (await sheet.count()) === 0);

// 8. Trash and undo with the per-record state: the folder goes and comes back.
const folder = page.locator('.desktop-icon', { hasText: 'Harbour' }).first();
await folder.click(); await page.keyboard.press('Delete'); await wait(600);
const gone = (await page.locator('.desktop-icon', { hasText: 'Harbour' }).count()) === 0;
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Control+z'); await wait(800);
const back = (await page.locator('.desktop-icon', { hasText: 'Harbour' }).count()) === 1;
check('Delete sends the folder to the Trash and Ctrl+Z brings it back', gone && back, `gone ${gone}, back ${back}`);

// 8b. Put back from the Trash window, then Ctrl+Z sends it back again. It
// used to say "Undone" and do nothing.
await folder.click(); await page.keyboard.press('Delete'); await wait(600);
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('g'); await page.keyboard.press('t'); await wait(600);
await page.locator('.frame[data-focused="true"] button', { hasText: /^Put back$/ }).first().click(); await wait(600);
const putBack = (await page.locator('.desktop-icon', { hasText: 'Harbour' }).count()) === 1;
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Control+z'); await wait(800);
const binnedAgain = (await page.locator('.desktop-icon', { hasText: 'Harbour' }).count()) === 0;
check('Ctrl+Z after Put back puts it back in the Trash', putBack && binnedAgain, `put back ${putBack}, binned again ${binnedAgain}`);

// 9. A Mac says ⌘.
const mac = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
});
const macPage = await mac.newPage();
macPage.on('pageerror', (e) => errors.push(`mac: ${String(e)}`));
await macPage.goto(URL); await wait(3000);
await macPage.evaluate(() => document.activeElement?.blur());
await macPage.keyboard.press('Shift+?'); await wait(300);
const macSheet = await macPage.locator('.shortcuts').innerText().catch(() => '');
check('on a Mac the sheet says ⌘ and ⌥, never Ctrl', /⌘/.test(macSheet) && /⌥/.test(macSheet) && !/\bCtrl\b/.test(macSheet));
await macPage.screenshot({ path: `${OUT}/shortcuts-mac.png` });
const keysDrawn = await macPage.locator('.launcher-keys kbd').allInnerTexts();
check('the search box draws ⌘ K on a Mac', keysDrawn.join('') === '⌘K', keysDrawn.join(''));
await mac.close();

// 10. Phone width: the sheet still opens from ?, has no snapping, no overflow.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phonePage = await phone.newPage();
phonePage.on('pageerror', (e) => errors.push(`phone: ${String(e)}`));
await phonePage.goto(URL); await wait(3000);
await phonePage.evaluate(() => document.activeElement?.blur());
await phonePage.keyboard.press('Shift+?'); await wait(300);
const phoneSheet = await phonePage.locator('.shortcuts').innerText().catch(() => '');
const overflow = await phonePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('phone: sheet opens, leaves out snapping, no overflow', phoneSheet.length > 0 && !/Snap/.test(phoneSheet) && !overflow, `overflow ${overflow}`);
await phonePage.screenshot({ path: `${OUT}/shortcuts-phone.png` });
await phone.close();

console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(failures ? `${failures} FAILED` : 'all passed');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
