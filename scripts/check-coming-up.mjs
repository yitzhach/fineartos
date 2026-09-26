/** The Coming up panel on the desktop.   npm run build && node scripts/check-coming-up.mjs */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4193;
const OUT = process.env.OUT ?? '/tmp';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
process.on('exit', () => { try { process.kill(-p.pid); } catch {} });
await wait(2500);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`); await wait(3000);
const panel = page.locator('.coming-up');
log('empty panel:', (await panel.innerText()).replace(/\n/g, ' | '));

const soon = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
const focused = page.locator('.frame[data-focused="true"]');
await page.locator('.dock button[title="Shows"]').click(); await wait(800);
await focused.getByLabel('New show name').fill('Harvest Fair');
await focused.getByRole('button', { name: 'Add show' }).click(); await wait(800);
await focused.locator('#sh-deadline').fill(soon); await wait(800);
await page.locator('.dock button[title="Home"]').click(); await wait(800);
log('panel:', (await panel.innerText()).replace(/\n/g, ' | '));
await page.screenshot({ path: `${OUT}/coming-desktop.png` });
await panel.getByRole('button').first().click(); await wait(800);
log('opened:', await focused.locator('.sh-window').count());
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Done' }).first().click().catch(() => {}); await wait(1000);
await page.screenshot({ path: `${OUT}/coming-phone.png` });
log('phone overflow:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
log('errors:', errors.join(' || ') || 'none');
await browser.close();
process.exit(0);
