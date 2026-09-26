/**
 * Phase 2 in a real browser: upgrade from database v6 (the build before)
 * with a second tab left open on it; the guest book moves from localStorage
 * into IndexedDB; a guest who later commissions a piece is one client with
 * both; a follow-up lands in Coming up; notes persist and the search box
 * finds them; quick capture on a phone saves a contact.
 *   OLD_DIST=/path/to/old-dist node scripts/check-clients-notes.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4191;
const URL = `http://localhost:${PORT}/`;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];
const serve = (dir) => {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', ...(dir ? ['--outDir', dir] : [])], { stdio: 'ignore', detached: true });
  const handle = { kill: () => { try { process.kill(-p.pid); } catch {} } };
  servers.push(handle);
  return handle;
};
process.on('exit', () => servers.forEach((one) => one.kill()));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const errors = [];

// 1. The old build (v6), a guest signed into localStorage, two tabs.
let server = serve(process.env.OLD_DIST);
await wait(2500);
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'p2-')), {
  executablePath: CHROME, args: ['--no-sandbox'], viewport: { width: 1440, height: 900 },
});
ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
const old1 = await ctx.newPage();
await old1.goto(URL); await wait(3000);
await old1.evaluate(() => {
  localStorage.setItem('artistOS.guestBook', JSON.stringify([{
    id: 'guest-1', name: 'Sample Client', email: 'client@example.com', phone: null, show: 'Harvest Fair',
    note: null, consented: true, likedPhotoIds: [], signaturePaths: null, signedAt: '2026-03-01T10:00:00.000Z',
  }]));
});
const old2 = await ctx.newPage();
await old2.goto(URL); await wait(1500);
console.log('old build loaded, two tabs, one guest in localStorage');

// 2. The new build, the old tab still open.
server.kill(); await wait(800);
server = serve(null);
await wait(2500);
const page = await ctx.newPage();
page.on('dialog', (d) => void d.accept());
await page.goto(URL); await wait(4000);
for (let i = 0; i < 3 && !(await page.locator('.dock button[title="Clients"]').count()); i++) {
  await page.reload(); await wait(3500);
}
check('new build is up beside the old tab', (await page.locator('.dock button[title="Clients"]').count()) === 1);
check('no database problem on the new tab', (await page.locator('.db-problem').count()) === 0);
const oldSays = await old2.locator('.db-problem').innerText().catch(() => '');
check('the old tab is told to reload, not left hanging', /reload/i.test(oldSays), oldSays.slice(0, 70));

const stored = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('artist-os'); q.onsuccess = () => r(q.result); });
  const version = db.version;
  const guests = await new Promise((r) => { const q = db.transaction('guests').objectStore('guests').getAll(); q.onsuccess = () => r(q.result); });
  db.close();
  return { version, guests: guests.length, local: localStorage.getItem('artistOS.guestBook'), backup: Boolean(localStorage.getItem('artistOS.guestBook.movedToDatabase')) };
});
check('database is version 7', stored.version === 7, String(stored.version));
check('the guest moved into IndexedDB', stored.guests === 1, `${stored.guests} guests`);
check('the localStorage copy is retired, kept as a backup', stored.local === null && stored.backup);

// 3. Clients: the guest and the demo commission are one person.
const win = () => page.locator('.frame[data-focused="true"]');
await page.locator('.dock button[title="Clients"]').click(); await wait(1500);
const rows = await win().locator('.sh-list li button').allInnerTexts();
check('one person from the guest book and the commission', rows.length === 1 && /Sample Client/.test(rows[0] ?? ''), rows.join(' | ').replace(/\n/g, ' '));
await win().locator('.sh-list li button').first().click(); await wait(500);
const kinds = await win().locator('.cl-sources li').allInnerTexts();
check('…with both records in theirs', kinds.some((k) => /Commission/.test(k)) && kinds.some((k) => /Guest book/.test(k)), kinds.join(' | '));
const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
await win().locator('input[type=date]').fill(soon); await wait(800);
await win().locator('input[placeholder^="collector"]').fill('collector, repeat');
await win().locator('textarea').first().click(); await wait(600);

// 4. The follow-up shows in Coming up on the desktop.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('g'); await page.keyboard.press('h'); await wait(1000);
const panel = await page.locator('.coming-up').innerText().catch(() => '');
check('the follow-up is in Coming up', /Follow up/.test(panel) && /Sample Client/.test(panel), panel.replace(/\n/g, ' | ').slice(0, 120));

// 5. Notes: write, reload, find in the search box.
await page.keyboard.press('g'); await page.keyboard.press('n'); await wait(1500);
await win().getByRole('button', { name: 'New note' }).click(); await wait(600);
await win().getByLabel('Note', { exact: true }).fill('Ask the framer about museum glass');
await win().getByLabel('New checklist item').click(); await wait(400);
await win().getByLabel('New checklist item').fill('Measure the triptych');
await win().getByRole('button', { name: 'Add' }).click(); await wait(800);
await page.reload(); await wait(4000);
await page.keyboard.press('Control+k'); await wait(300);
await page.keyboard.type('museum glass'); await wait(400);
const found = await page.locator('.launcher-row .launcher-title').allInnerTexts();
check('the search box finds the note after a reload', found.some((t) => /museum glass/.test(t)), found.slice(0, 3).join(' | '));
await page.keyboard.press('Enter'); await wait(1500);
const noteText = await win().innerText().catch(() => '');
check('…and opens it with its checklist', /Measure the triptych/.test(noteText));

// 6. Trash: a note goes to the Trash, not away.
await win().getByRole('button', { name: 'Move to Trash' }).click(); await wait(800);
await page.keyboard.press('Escape');
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('g'); await page.keyboard.press('t'); await wait(1200);
const trash = await win().innerText().catch(() => '');
check('a note moved to the Trash is listed there', /museum glass/.test(trash), trash.slice(0, 80).replace(/\n/g, ' '));

// 7. Phone: quick capture saves a contact.
const phone = await ctx.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(URL); await wait(3500);
check('quick capture button on a phone', (await phone.locator('.qc-fab').count()) === 1);
await phone.locator('.qc-fab').click(); await wait(1200);
await phone.getByRole('button', { name: 'New contact' }).click(); await wait(300);
await phone.getByLabel('Name', { exact: true }).fill('Rae Lin');
await phone.getByLabel('Email', { exact: true }).fill('rae@example.com');
await phone.getByRole('button', { name: 'Save contact' }).click(); await wait(1000);
const saidPhone = await phone.locator('body').innerText();
check('quick capture says where the contact went', /Rae Lin is in Clients/.test(saidPhone));
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('no sideways scroll on a phone', !overflow);

await ctx.close();
console.log(errors.length ? `ERRORS\n${errors.join('\n')}` : 'errors: none');
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
