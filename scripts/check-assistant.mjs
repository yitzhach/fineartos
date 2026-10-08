/**
 * The studio assistant in a real browser, with the platform faked at the
 * network (Art-Talk-Back D-078/D-079): a fresh load calls no studio path;
 * sign-in by email code; a reply that opens Finance; a device card that makes
 * a note in a folder only on Confirm, still there after a reload; signing out.
 *   npm run build && node scripts/check-assistant.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4194;
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
const studioCalls = [];
let signedIn = false;
let chats = [];
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

await wait(2500);
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'as-')), {
  executablePath: CHROME, args: ['--no-sandbox'], viewport: { width: 1440, height: 900 },
});
ctx.on('page', (pg) => pg.on('pageerror', (e) => errors.push(String(e))));
await ctx.route(/\/(v1|assistant)\//, async (route) => {
  const req = route.request();
  const path = new globalThis.URL(req.url()).pathname;
  studioCalls.push(path);
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/assistant/status') return json(200, { available: true });
  if (path === '/v1/me') return signedIn ? json(200, { data: { user: { email: 'isaac@example.com' } } }) : json(401, { error: { code: 'unauthorized', message: 'Sign in' } });
  if (path === '/v1/auth/code') return route.fulfill({ status: 204 });
  if (path === '/v1/auth/verify') {
    const body = req.postDataJSON();
    if (body.code !== '123456') return json(400, { error: { code: 'bad_request', message: 'That code is not right.' } });
    signedIn = true;
    return json(200, { data: { user: { email: body.email } } });
  }
  if (path === '/v1/auth/logout') { signedIn = false; return route.fulfill({ status: 204 }); }
  if (path === '/assistant/chat') {
    const body = req.postDataJSON();
    chats.push(body);
    const folder = /Folders: ([^\n,]+)/.exec(body.appMap)?.[1] ?? '';
    const events = /commission/.test(body.message)
      ? [{ type: 'device', id: 'toolu_2', name: 'commission_draft', input: { title: 'Harbour mural', client_name: 'Ana', price: 1200, folder }, summary: 'Commission draft' }, { type: 'end', reason: 'end_turn' }]
      : /invoice/.test(body.message)
      ? [{ type: 'device', id: 'toolu_3', name: 'invoice_draft', input: { client_name: 'Ben', description: 'Print', amount: 85 }, summary: 'Invoice draft' }, { type: 'end', reason: 'end_turn' }]
      : /books/.test(body.message)
      ? [{ type: 'open', place: 'Dock', control: 'Finance' }, { type: 'text', text: 'The books are open.' }, { type: 'end', reason: 'end_turn' }]
      : [{ type: 'device', id: 'toolu_1', name: 'note_create', input: { title: 'Framing quote', checklist: ['Measure'], keep_on: 'folder', folder }, summary: `Note “Framing quote” in ${folder}` }, { type: 'end', reason: 'end_turn' }];
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(events) });
  }
  return json(404, { error: { code: 'not_found', message: 'no' } });
});

const page = await ctx.newPage();
await page.goto(URL); await wait(4000);
check('a fresh load calls no studio path', studioCalls.length === 0, studioCalls.join(' '));
const other = await ctx.newPage();
await other.goto(URL); await wait(2000);
await page.bringToFront();
const win = () => page.locator('.frame[data-focused="true"]');

await page.locator('.dock button[title="Assistant"]').click(); await wait(1500);
check('no stray preview under the window', !/does not exist yet/.test(await win().innerText()));
check('signed out, the Assistant asks to sign in', await win().getByText('Sign in to your studio').count() === 1);
await win().getByLabel('Email').fill('isaac@example.com');
await win().getByRole('button', { name: 'Email me a code' }).click(); await wait(600);
await win().getByLabel(/6-digit code/).fill('000000');
await win().getByRole('button', { name: 'Sign in' }).click(); await wait(600);
check('a wrong code says so', /not right/.test(await win().innerText()));
await win().getByLabel(/6-digit code/).fill('123456');
await win().getByRole('button', { name: 'Sign in' }).click(); await wait(800);
check('signed in, the chat shows', await win().getByLabel('Ask the assistant').count() === 1);

await win().getByLabel('Ask the assistant').fill('open the books');
await win().getByLabel('Ask the assistant').press('Enter'); await wait(1500);
const titles = await page.locator('.frame .frame-title, .frame [class*="title"]').allInnerTexts();
check('the reply opened Finance', titles.some((t) => /Finance/.test(t)), titles.slice(0, 6).join(' | '));
const sent = chats[0] ?? {};
check('the chat sent device actions, the map and the snapshot', sent.app === 'fineartos' && sent.deviceActions?.length === 7 && /Dock: .*Notes/.test(sent.appMap ?? '') && /Folders:/.test(sent.appData ?? ''));

await page.locator('.dock button[title="Assistant"]').click(); await wait(800);
if (!(await win().getByLabel('Ask the assistant').count())) { await page.locator('.dock button[title="Assistant"]').click(); await wait(800); }
await win().getByLabel('Ask the assistant').fill('make a note called Framing quote in my folder');
await win().getByLabel('Ask the assistant').press('Enter'); await wait(1500);
check('a card waits for Confirm', await win().getByRole('button', { name: 'Confirm' }).count() === 1);
const before = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('artist-os'); q.onsuccess = () => r(q.result); });
  const n = await new Promise((r) => { const q = db.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => r(q.result.length); });
  db.close(); return n;
});
check('nothing saved before Confirm', before === 0, String(before));
await win().getByRole('button', { name: 'Confirm' }).click(); await wait(1200);
check('Confirm says where it went', /saved in the folder/.test(await win().innerText()));

await win().getByLabel('Ask the assistant').fill('thanks');
await win().getByLabel('Ask the assistant').press('Enter'); await wait(1200);
check('the next turn reports the card as done', /done on the device/.test(JSON.stringify(chats.at(-1)?.deviceOutcomes ?? [])));

await page.reload(); await wait(4000);
const folderName = /Folders: ([^\n,]+)/.exec(chats[1]?.appMap ?? '')?.[1] ?? '';
await page.locator('.desktop-icon', { hasText: folderName }).first().dblclick(); await wait(1500);
check('after a reload the note is in the folder', /Framing quote/.test(await win().innerText()), folderName);
check('the second tab saw no database problem', (await other.locator('.db-problem').count()) === 0);

await page.locator('.dock button[title="Assistant"]').click(); await wait(1500);
check('still signed in after a reload', await win().getByLabel('Ask the assistant').count() === 1);

const records = (store) => page.evaluate(async (store) => {
  const db = await new Promise((r) => { const q = indexedDB.open('artist-os'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result); });
  db.close(); return all.map((r) => r.document ?? r.project ?? r.invoice ?? r);
}, store);
const ask = async (text) => {
  if (!(await win().getByLabel('Ask the assistant').count())) { await page.locator('.dock button[title="Assistant"]').click(); await wait(800); }
  await win().getByLabel('Ask the assistant').fill(text);
  await win().getByLabel('Ask the assistant').press('Enter'); await wait(1500);
};
const confirmCard = async () => {
  if (!(await win().getByRole('button', { name: 'Confirm' }).count())) { await page.locator('.dock button[title="Assistant"]').click(); await wait(800); }
  await win().getByRole('button', { name: 'Confirm' }).click(); await wait(1500);
};
const docsBefore = (await records('documents')).length;
await ask('start a commission for Ana, harbour mural, 1200');
await confirmCard();
const docs = await records('documents');
const mural = docs.find((d) => d.title === 'Harbour mural');
check('Confirm made one commission draft with the price', docs.length === docsBefore + 1 && mural?.state === 'draft' && mural?.client?.name === 'Ana' && mural?.quote?.lineItems?.[0]?.unitPrice === 120000, JSON.stringify(mural ?? docs.at(-1))?.slice(0, 300));
const filedIn = (await records('projects')).find((p) => p.name === folderName);
check('the commission is filed in the folder', Boolean(mural && filedIn?.documentIds?.includes(mural.id)));
await ask('make an invoice for Ben, a print, 85 dollars');
await confirmCard();
const inv = (await records('invoices')).find((i) => i.client?.name === 'Ben');
check('Confirm made an invoice draft with the amount', inv?.state === 'draft' && inv?.quote?.lineItems?.[0]?.unitPrice === 8500, JSON.stringify(inv ?? null)?.slice(0, 300));
if (!(await win().getByRole('button', { name: 'Sign out' }).count())) { await page.locator('.dock button[title="Assistant"]').click(); await wait(800); }
await win().getByRole('button', { name: 'Sign out' }).click(); await wait(800);
check('sign out goes back to sign-in', await win().getByText('Sign in to your studio').count() === 1);
check('no page errors', errors.length === 0, errors.join(' | '));

await ctx.close();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
