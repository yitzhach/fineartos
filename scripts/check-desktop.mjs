/** Tool windows draw in their body (not the toolbar); desktop tools, panel and notice clear of icons and dock at 390/820/1024. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const p = spawn('npx', ['vite','preview','--port','4194','--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errors = [];
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4194/'); await wait(3000);
await page.locator('input[type=file][accept^="image/png"]').setInputFiles('public/icon-512.png'); await wait(2500);
const m = () => page.evaluate(() => { const fr = document.querySelector('.frame[data-focused="true"]'); const body = fr.querySelector('.frame-body');
  return `frameScroll ${fr.scrollTop} bodyH ${body.clientHeight}`; });
for (const tool of ['Shows', 'Artwork', 'Finance']) {
  await page.locator(`.dock button[title="${tool}"]`).click(); await wait(1000);
  console.log(tool, await m());
}
const f = page.locator('.frame:has(.sh-window)');
await page.locator('.dock button[title="Shows"]').click(); await wait(800);
if (!(await page.locator('.sh-window').count())) { await page.locator('.dock button[title="Shows"]').click(); await wait(800); }
console.log('sh', await page.locator('.sh-window').count(), await page.locator('.frame').count()); await page.screenshot({ path: (process.env.OUT ?? '/tmp') + '/dbg.png' });
await f.getByLabel('New show name').fill('X'); await f.getByRole('button', { name: 'Add show' }).click(); await wait(800);
await f.locator('.sh-piece').first().click(); await wait(800);
console.log('Shows after piece', await m());
await page.screenshot({ path: (process.env.OUT ?? '/tmp') + '/shows-fixed.png' });
for (const w of [390, 820, 1024]) {
  await page.setViewportSize({ width: w, height: 844 });
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Done' }).first().click({ timeout: 1500 }).catch(() => {});
  await page.locator('.dock button[title="Home"]').click({ timeout: 1500 }).catch(() => {});
  await wait(800);
  const r = await page.evaluate(() => {
    const t = document.querySelector('.desktop-tools').getBoundingClientRect();
    const icons = [...document.querySelectorAll('.desktop-icon')].map((e) => e.getBoundingClientRect());
    const hit = icons.filter((i) => !(i.right < t.left || i.left > t.right || i.bottom < t.top || i.top > t.bottom)).length;
    const cu = document.querySelector('.coming-up')?.getBoundingClientRect();
    const cuHit = cu ? icons.filter((i) => !(i.right < cu.left || i.left > cu.right || i.bottom < cu.top || i.top > cu.bottom)).length : 0;
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const n = document.querySelector('.desktop-notice')?.getBoundingClientRect();
    return `notice bottom ${n ? Math.round(n.bottom) : '-'}, labels ${[...document.querySelectorAll('.desktop-tools .btn')].map((x) => x.innerText).join('/')}, tools ${Math.round(t.left)}-${Math.round(t.right)} y${Math.round(t.top)}-${Math.round(t.bottom)}, off-screen ${t.left < 0}, icons hit ${hit}, panel hits ${cuHit}, dock top ${Math.round(dock.top)}, overflow ${document.documentElement.scrollWidth > innerWidth}`;
  });
  console.log(w, r);
  await page.screenshot({ path: `/tmp/claude-0/desk-${w}.png` });
}
console.log('errors', errors.join(' || ') || 'none');
await b.close(); process.exit(0);
