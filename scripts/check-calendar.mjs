/**
 * Phase 6 calendar and tasks in a real browser, desktop and phone, second tab
 * open. The gate: every dated thing in the studio appears once, in one place.
 * A show with a deadline, the demo commission's delivery, a task added on the
 * commission, a client follow-up — each once in the list, the show on every
 * day it runs, all in the .ics; the task never on the client's document; the
 * board places the commission by stage.
 *   npm run build && node scripts/check-calendar.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4197;
const URL = `http://localhost:${PORT}/`;
const OUT = process.env.OUT ?? '/tmp';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
await wait(2500);
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'c-')), { executablePath: CHROME, args: ['--no-sandbox'], viewport, acceptDownloads: true });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL); await wait(4000);
  const other = await ctx.newPage(); await other.goto(URL); await wait(1500);
  await page.bringToFront();
  const focused = () => page.locator('.frame[data-focused="true"]');
  const open = async (name) => {
    await page.keyboard.press('Escape'); await wait(200);
    await page.keyboard.press('/'); await wait(400);
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).first().click(); await wait(1200);
  };

  // A show with dates and a missed deadline.
  await open('Shows');
  await focused().getByLabel('New show name').fill('Spring Market');
  await focused().getByRole('button', { name: 'Add show' }).click(); await wait(600);
  await focused().locator('#sh-start').fill(day(1));
  await focused().locator('#sh-end').fill(day(3));
  await focused().locator('#sh-deadline').fill(day(-5)); await wait(500);

  // A follow-up on a client.
  await page.evaluate((date) => new Promise((res) => {
    const r = indexedDB.open('artist-os');
    r.onsuccess = () => {
      const tx = r.result.transaction('clients', 'readwrite');
      tx.objectStore('clients').put({ id: 'p1', workspaceId: 'local', profile: { id: 'p1', keys: ['email:bo@example.com'], name: null, label: 'Bo Collector', tags: [], followUp: date, note: null, notSame: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' } });
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }), day(4));
  await page.reload(); await wait(3000);

  // A task on the demo commission.
  await open('Projects'); await wait(500);
  await focused().getByRole('button', { name: 'Open', exact: true }).first().click(); await wait(1500);
  await focused().getByRole('button', { name: /^Tasks/ }).click(); await wait(400);
  await focused().getByLabel('New task', { exact: true }).fill('Order linen');
  await focused().getByLabel('New task due date').fill(day(2));
  await focused().getByRole('button', { name: 'Add', exact: true }).click(); await wait(800);
  ok(`${label}: task added on the commission`, (await focused().locator('input[aria-label="Task"]').inputValue()) === 'Order linen');
  await focused().getByRole('button', { name: /^Document/ }).click(); await wait(800);
  ok(`${label}: task not on the client's document`, !(await focused().innerText()).includes('Order linen'));

  // The calendar.
  await open('Calendar');
  const cal = focused().locator('.ca');
  await cal.getByRole('tab', { name: 'List' }).click(); await wait(400);
  const listText = await cal.innerText();
  const count = (s) => listText.split(s).length - 1;
  ok(`${label}: Spring Market listed twice (show + deadline), each once`, count('Spring Market') === 2, `${count('Spring Market')}`);
  ok(`${label}: deadline in Overdue`, /Overdue \(\d+\)[\s\S]*Spring Market[\s\S]*Application deadline/.test(listText));
  ok(`${label}: task once`, count('Order linen') === 1);
  ok(`${label}: follow-up once`, count('Bo Collector') === 1);
  ok(`${label}: demo delivery once`, (listText.match(/Harbour triptych\s*\n?\s*Delivery/g) ?? []).length === 1, listText.slice(0, 0));

  // Month: the show on each of its three days.
  await cal.getByRole('tab', { name: 'Month' }).click(); await wait(400);
  const chipsOnShow = await cal.locator('.ca-chip[data-kind="show"]').count();
  ok(`${label}: show on 3 days in the month grid`, chipsOnShow === 3 || (day(1).slice(0, 7) !== day(3).slice(0, 7)), `${chipsOnShow}`);
  await page.screenshot({ path: `${OUT}/cal-${label}-month.png` });

  // ICS.
  const d = page.waitForEvent('download');
  await cal.getByRole('button', { name: /Save to phone calendar/ }).click();
  const file = await d; const path = join(OUT, `${label}-studio.ics`); await file.saveAs(path);
  const ics = readFileSync(path, 'utf8');
  const uids = ics.match(/^UID:.*$/gm) ?? [];
  ok(`${label}: ics holds each, unique UIDs`, ['Spring Market — Show', 'Order linen — Harbour triptych', 'Bo Collector — Follow up', 'Harbour triptych — Delivery'].every((s) => ics.includes(s)) && new Set(uids).size === uids.length, `${uids.length} events`);
  ok(`${label}: ics show spans 3 days`, ics.includes(`DTSTART;VALUE=DATE:${day(1).replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${day(4).replace(/-/g, '')}`));

  // Filter off tasks hides them.
  await cal.locator('.ca-kind[data-kind="task"]').click(); await wait(300);
  await cal.getByRole('tab', { name: 'List' }).click(); await wait(300);
  ok(`${label}: kind filter hides tasks`, !(await cal.innerText()).includes('Order linen'));
  await cal.locator('.ca-kind[data-kind="task"]').click(); await wait(300);

  // Opening an item lands on its record.
  await cal.locator('.ca-item', { hasText: 'Order linen' }).click(); await wait(1200);
  ok(`${label}: task opens its commission`, (await focused().innerText()).includes('Harbour triptych'));

  // Board.
  await open('Calendar');
  await focused().locator('.ca').getByRole('tab', { name: 'Board' }).click(); await wait(400);
  // The demo record is a draft: Quoting, whatever money it holds.
  const quoting = focused().locator('.ca-col[aria-label="Quoting"]');
  ok(`${label}: board puts the draft demo commission under Quoting`, (await quoting.innerText()).includes('Harbour triptych'));
  ok(`${label}: in exactly one column`, (await focused().locator('.ca-card', { hasText: 'Harbour triptych' }).count()) === 1);
  await page.screenshot({ path: `${OUT}/cal-${label}-board.png` });

  // After a reload the task is still there.
  await page.reload(); await wait(3000);
  await open('Calendar');
  await focused().locator('.ca').getByRole('tab', { name: 'List' }).click(); await wait(300);
  ok(`${label}: task survives a reload`, (await focused().innerText()).includes('Order linen'));

  await other.reload(); await wait(2500);
  ok(`${label}: second tab alive`, (await other.locator('.db-problem').count()) === 0);
  ok(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
console.log(`${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
