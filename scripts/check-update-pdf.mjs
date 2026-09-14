/**
 * Browser check for the PDF hand-off of a client update. Run against the
 * preview build:
 *
 *   npm run build && npm run preview -- --port 4181
 *   node scripts/check-update-pdf.mjs > /tmp/pdf.txt 2>&1
 *
 * The print dialog itself is the browser's and cannot be driven, so window
 * .print is wrapped to record that it was called on the hidden frame. What is
 * checked is everything this app is responsible for: the sheet that would be
 * printed, that the hand-off is recorded once, and that an existing database
 * and a second tab both agree.
 */
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4181/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const errors = [];
const notes = [];
process.on('uncaughtException', (e) => {
  console.log('NOTES:\n' + notes.join('\n'));
  console.log('CRASH: ' + e.message.split('\n')[0]);
  process.exit(1);
});


const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
};
watch(page, 'tab1');


const openUpdates = async (p, number = null) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const frame = p.locator('.frame[data-focused="true"]');
    const title = await frame.locator('.frame-title').first().innerText().catch(() => '');
    if (!number || title.includes(number)) {
      const tab = frame.getByRole('button', { name: /^Client(\s\d+)?$/ }).first();
      if (await tab.count()) {
        await tab.click();
        await p.waitForTimeout(700);
        if (await p.locator('#upd-headline').count()) return;
      }
    }
    // The right commission is not on top: open it from Projects by number.
    await p.getByRole('button', { name: 'Projects', exact: true }).first().click().catch(() => {});
    await p.waitForTimeout(900);
    const row = p
      .locator('.frame[data-focused="true"] .doc-row')
      .filter({ hasText: number ?? 'AO-' })
      .first();
    await row.getByRole('button', { name: 'Open', exact: true }).click().catch(() => {});
    await p.waitForTimeout(1100);
  }
  notes.push('could not reach the Client tab');
  notes.push('focused buttons = ' + JSON.stringify((await p.locator('.frame[data-focused="true"] button').allInnerTexts()).slice(0, 30)));
};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await openUpdates(page);
await page.fill('#upd-headline', 'Underpainting done');
await page.fill('#upd-note', 'The ground is down and drying.');
const picks = page.locator('.upd-pick');
if (await picks.count()) {
  await picks.first().click();
  notes.push('a picture was picked, so the sheet has one to inline');
} else {
  notes.push('no pictures on this commission — the sheet was checked without one');
}
await page.getByRole('checkbox').first().check().catch(() => notes.push('no sign-off checkbox'));
await page.getByRole('button', { name: 'Save the update' }).click();
await page.waitForTimeout(1000);
notes.push('title before reload = ' + JSON.stringify(await page.locator('.frame[data-focused="true"] .frame-title').first().innerText().catch(() => '?')));
notes.push('pane before reload = ' + JSON.stringify((await page.locator('.upd-history').first().innerText().catch(() => 'NO history')).slice(0, 300)));

// --- An EXISTING database from here down. ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await openUpdates(page, 'AO-2026-0001');
notes.push('title after reload = ' + JSON.stringify(await page.locator('.frame[data-focused="true"] .frame-title').first().innerText().catch(() => '?')));
notes.push('pane after reload = ' + JSON.stringify((await page.locator('.upd').first().innerText().catch(() => 'NO .upd')).slice(0, 400)));
await page.getByRole('button', { name: 'Print / Save as PDF' }).first().click();
await page.waitForTimeout(2000);

// The print dialog belongs to the browser and cannot be driven from here;
// headless leaves print() a no-op, so the frame it would have printed is
// still in the page. That frame IS the sheet, so it is what gets checked.
const sheet = await page.evaluate(() => {
  const frame = document.querySelector('iframe[aria-hidden="true"]');
  return frame?.contentDocument?.documentElement?.outerHTML ?? '';
});
notes.push(`sheet length = ${sheet.length}`);
if ((await picks.count()) && !sheet.includes('data:image/')) {
  errors.push('the picture was not inlined into the sheet');
}
for (const want of ['Underpainting done', 'The ground is down', 'carry on from here']) {
  if (!sheet.includes(want)) errors.push(`the sheet is missing ${JSON.stringify(want)}`);
}
if (sheet.includes('mailto:')) errors.push('the sheet printed a dead button');

const history = await page.locator('.upd-handoffs').first().innerText().catch(() => '');
notes.push(`hand-off history = ${JSON.stringify(history)}`);
if (!history.includes('Printed or saved as a PDF')) errors.push('the hand-off was not recorded');
if ((history.match(/Printed or saved as a PDF/g) ?? []).length !== 1) {
  errors.push('the hand-off was recorded more than once');
}
const status = await page.locator('.notice').first().innerText().catch(() => '');
notes.push(`message = ${JSON.stringify(status)}`);

// --- A SECOND TAB, open at the same time. ---
const two = await ctx.newPage();
watch(two, 'tab2');
await two.goto(URL, { waitUntil: 'networkidle' });
await two.waitForTimeout(1500);
await openUpdates(two, 'AO-2026-0001');
const seen = await two.locator('.upd-handoffs').first().innerText().catch(() => '');
if (!seen.includes('Printed or saved as a PDF')) errors.push('the second tab does not see the hand-off');
await page.waitForTimeout(600);
if (await page.evaluate(() => document.body.innerText.length === 0)) errors.push('tab1 went blank');

// --- Phone width: the button must still be reachable. ---
await two.close();
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(700);
const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (wide) errors.push('horizontal overflow at 390px');
if (!(await page.getByRole('button', { name: 'Print / Save as PDF' }).first().isVisible())) {
  errors.push('the PDF button is not visible at phone width');
}

console.log('NOTES:\n' + notes.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'OK — no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
