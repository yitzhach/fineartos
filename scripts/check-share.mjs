/**
 * Viewing links end to end, in a real browser against `wrangler dev` (the
 * real Worker, a local R2 bucket, a stand-in studio-api). Signed out: no
 * button. Signed in: add a link → the message carries it → the client page
 * shows the picture → remove → the page says it is gone. Email opens in a
 * new tab, never over the app.
 *   node scripts/check-share.mjs   (after npm run build)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8794;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT ?? '/tmp';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const persist = mkdtempSync(join(tmpdir(), 'share-r2-'));
const p = spawn(
  'npx',
  ['wrangler', 'dev', '-c', 'wrangler.jsonc', '-c', 'scripts/fake-studio-api/wrangler.jsonc', '--port', String(PORT), '--persist-to', persist],
  { stdio: 'ignore', detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
);
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
for (let i = 0; i < 90; i++) {
  try { if ((await fetch(URL + 'share/status')).ok) break; } catch {}
  await wait(1000);
}
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name); };

ok('status says on', (await (await fetch(URL + 'share/status')).json()).available === true);
ok('upload refused signed out', (await fetch(URL + 'share/pictures', { method: 'POST' })).status === 401);

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 's-')), { executablePath: CHROME, args: ['--no-sandbox'], viewport: { width: 1280, height: 860 } });
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL); await wait(4000);
await page.locator('main input[type=file][accept^="image/png"]').setInputFiles('public/icon-512.png'); await wait(2500);

const openSend = async () => {
  await page.keyboard.press('/'); await wait(500);
  await page.getByRole('option', { name: /^Connect/ }).first().click(); await wait(1500);
  const win = page.locator('.connect').last();
  await win.getByRole('button', { name: 'Send a picture' }).click(); await wait(800);
  return win;
};

let win = await openSend();
ok('signed out: no link button', (await win.getByRole('button', { name: 'Add a viewing link' }).count()) === 0);
ok('signed out: hint says sign in', /Signed in to your studio/.test(await win.locator('.send-form .hint').last().innerText()));
await win.getByLabel('Send to').fill('client@example.com');
const email = win.getByRole('link', { name: 'Email' });
ok('Email opens in a new tab', (await email.getAttribute('target')) === '_blank');

await ctx.addCookies([{ name: 'studio', value: 'ok', url: URL }]);
await page.evaluate(() => localStorage.setItem('artistOS.studio', JSON.stringify({ email: 'artist@example.com' })));
await page.reload(); await wait(3500);
win = await openSend();
const add = win.getByRole('button', { name: 'Add a viewing link' });
ok('signed in: link button shown', (await add.count()) === 1);
await add.click(); await wait(3000);
const message = await win.locator('.send-message').innerText();
const link = message.match(/See the picture here: (\S+)/)?.[1];
ok(`message carries the link (${link})`, Boolean(link && link.startsWith(`${URL}p/`)));
await win.getByLabel('Send to').fill('client@example.com');
ok('Email body carries the link', decodeURIComponent((await email.getAttribute('href')) ?? '').includes(link ?? 'none'));
await page.screenshot({ path: `${OUT}/share-app.png` });

const client = await (await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })).newPage({ viewport: { width: 390, height: 844 } });
const res = await client.goto(link); await wait(800);
ok('client page 200', res?.status() === 200);
ok('client page draws the picture', await client.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0));
ok('client page says when it ends', /stops working on/.test(await client.locator('body').innerText()));
await client.screenshot({ path: `${OUT}/share-client.png`, fullPage: true });

await win.getByRole('button', { name: 'Remove link' }).click(); await wait(1500);
ok('message drops the link', !(await win.locator('.send-message').innerText()).includes('See the picture here'));
const gone = await client.goto(link); await wait(300);
ok('removed link says gone', gone?.status() === 404 && /no longer available/.test(await client.locator('body').innerText()));
ok('no page errors', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
