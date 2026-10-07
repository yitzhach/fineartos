/**
 * Notes save without a blur and can live on the home screen or in a folder.
 * A title is typed, the window closed straight away (no blur), the page
 * reloaded with a second tab open: the note is there, as a home-screen icon.
 * Then it is kept in a folder: off the home screen, listed inside the folder.
 *   npm run build && node scripts/check-notes-place.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4193;
const URL = `http://localhost:${PORT}/`;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const errors = [];

await wait(2500);
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'np-')), {
  executablePath: CHROME, args: ['--no-sandbox'], viewport: { width: 1440, height: 900 },
});
ctx.on('page', (pg) => pg.on('pageerror', (e) => errors.push(String(e))));
const page = await ctx.newPage();
page.on('dialog', (d) => void d.accept('Gallery folder'));
await page.goto(URL); await wait(4000);
const other = await ctx.newPage();
await other.goto(URL); await wait(2500);
await page.bringToFront();
const win = () => page.locator('.frame[data-focused="true"]');
const icons = () => page.locator('.desktop-icon .label').allInnerTexts();

// 1. Title + text, then close at once: no blur ever reaches the fields.
await page.keyboard.press('g'); await page.keyboard.press('n'); await wait(1500);
await win().getByRole('button', { name: 'New note' }).click(); await wait(600);
await win().getByLabel('Title', { exact: true }).fill('Gallery list');
await win().getByLabel('Note', { exact: true }).fill('Call Ana about the spring show');
await win().locator('button.light.close').click(); await wait(1000);
await page.reload(); await wait(4000);
let names = await icons();
check('the note survived closing without a blur, and sits on the home screen', names.includes('Gallery list'), names.join(' | '));

// 2. Open it from the home screen, keep it in a new folder.
await page.locator('.desktop-icon', { hasText: 'Gallery list' }).dblclick(); await wait(1500);
const body = await win().locator('textarea').inputValue().catch(() => '');
check('the icon opens the note with its words', /spring show/.test(body), body);
await win().locator('button.light.close').click(); await wait(600);
await page.locator('.desktop-tools button', { hasText: 'New project folder' }).click(); await wait(1200);
await page.keyboard.press('Escape'); await wait(300);
await page.evaluate(() => document.activeElement?.blur());
await page.locator('.desktop-icon', { hasText: 'Gallery list' }).dblclick(); await wait(1500);
const opts = await win().getByLabel('Keep it on').locator('option').allInnerTexts();
const folderOpt = opts.find((o) => o.startsWith('Folder'));
check('a folder is offered as a place', Boolean(folderOpt), opts.join(' | '));
await win().getByLabel('Keep it on').selectOption({ label: folderOpt });
await wait(500);
await win().getByRole('button', { name: 'Save', exact: true }).click(); await wait(800);
const said = await page.locator('body').innerText();
check('Save says where it went', /Note saved in the folder/.test(said));
await page.reload(); await wait(4000);
names = await icons();
check('in a folder it is off the home screen', !names.includes('Gallery list'), names.join(' | '));
const folderName = folderOpt.replace(/^Folder · /, '');
await page.locator('.desktop-icon', { hasText: folderName }).first().dblclick(); await wait(1500);
const inside = await win().innerText().catch(() => '');
check('…and listed inside the folder after a reload', /Gallery list/.test(inside), inside.slice(0, 120).replace(/\n/g, ' '));
check('the second tab saw no database problem', (await other.locator('.db-problem').count()) === 0);
check('no page errors', errors.length === 0, errors.join(' | '));

await ctx.close();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
