/**
 * Turns the artist's own photographs into desktop pictures that ship with the
 * app, and writes the list the picker reads.
 *
 *   mkdir wallpaper-source && cp ~/pictures/*.jpg wallpaper-source/
 *   npm run wallpapers
 *
 * What it does to each picture, and why:
 *
 *  - Resizes it to 2560px on the longest edge. That covers a 5K display at
 *    the scaling a background gets away with, and a phone photograph is
 *    typically 4000px+, which is bytes nobody sees.
 *  - Re-encodes it as WebP at quality 0.82. A 2560px JPEG off a camera is
 *    1.5–3 MB; the same picture as WebP is usually 250–450 KB and looks the
 *    same behind windows and a dim. Every browser this app supports reads
 *    WebP.
 *  - Writes a 480px thumbnail as well, so the Settings grid loads kilobytes
 *    rather than megabytes.
 *
 * The output goes in `public/wallpapers/photographs/`, which Cloudflare serves
 * as a static asset — it is not in the JavaScript bundle, and the browser
 * fetches one only when it is picked. They are deliberately left out of the
 * service worker's install list for the same reason; see src/lib/photographs.ts.
 *
 * Keep the whole folder under a few megabytes. Git keeps every version of a
 * binary forever, so a 12 MB photograph replaced three times is 48 MB in the
 * repository for as long as it exists.
 *
 * No new dependency: the decoding and encoding are done by the Chromium that
 * Playwright already installs for the browser checks.
 */

import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const SOURCE = process.env.WALLPAPER_SOURCE ?? 'wallpaper-source';
const OUT = 'public/wallpapers/photographs';
const LIST = 'src/lib/photographs.ts';
const FULL_EDGE = 2560;
const THUMB_EDGE = 480;
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.72;
/** A picture bigger than this is worth another look before it is committed. */
const BUDGET_BYTES = 500 * 1024;
const TOTAL_BUDGET_BYTES = 8 * 1024 * 1024;

const READABLE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

let sources;
try {
  sources = readdirSync(SOURCE)
    .filter((name) => READABLE.has(extname(name).toLowerCase()))
    .sort();
} catch {
  console.error(`No ${SOURCE}/ folder. Put the photographs there and run this again.`);
  process.exit(1);
}

if (sources.length === 0) {
  console.error(`${SOURCE}/ has no readable pictures (${[...READABLE].join(', ')}).`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM, args: ['--no-sandbox'] } : {},
);
const page = await browser.newPage();

/** Decode, resize and re-encode in the browser, which has the codecs. */
const encode = (dataUrl, edge, quality) =>
  page.evaluate(
    async ([url, maxEdge, q]) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return { data: canvas.toDataURL('image/webp', q).split(',')[1], width, height };
    },
    [dataUrl, edge, quality],
  );

const entries = [];
let total = 0;

for (const file of sources) {
  const bytes = readFileSync(join(SOURCE, file));
  const mime = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

  const slug = basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const name = basename(file, extname(file)).replace(/[_-]+/g, ' ').trim();

  const full = await encode(dataUrl, FULL_EDGE, FULL_QUALITY);
  const thumb = await encode(dataUrl, THUMB_EDGE, THUMB_QUALITY);

  writeFileSync(join(OUT, `${slug}.webp`), Buffer.from(full.data, 'base64'));
  writeFileSync(join(OUT, `${slug}-thumb.webp`), Buffer.from(thumb.data, 'base64'));

  const size = statSync(join(OUT, `${slug}.webp`)).size;
  total += size + statSync(join(OUT, `${slug}-thumb.webp`)).size;

  entries.push({
    src: `/wallpapers/photographs/${slug}.webp`,
    thumb: `/wallpapers/photographs/${slug}-thumb.webp`,
    name,
    width: full.width,
    height: full.height,
    bytes: size,
  });

  const from = statSync(join(SOURCE, file)).size;
  const warn = size > BUDGET_BYTES ? '  ← over budget, consider a smaller crop' : '';
  console.log(
    `${file}: ${Math.round(from / 1024)} KB → ${Math.round(size / 1024)} KB, ${full.width}×${full.height}${warn}`,
  );
}

await browser.close();

const generated = entries
  .map(
    (entry) =>
      `  {\n    src: '${entry.src}',\n    thumb: '${entry.thumb}',\n    name: ${JSON.stringify(entry.name)},\n    width: ${entry.width},\n    height: ${entry.height},\n    bytes: ${entry.bytes},\n  },`,
  )
  .join('\n');

const source = readFileSync(LIST, 'utf8');
const begin = source.indexOf('/* BEGIN GENERATED');
const end = source.indexOf('/* END GENERATED');
if (begin === -1 || end === -1) {
  console.error(`${LIST} has lost its BEGIN/END GENERATED markers — not writing the list.`);
  process.exit(1);
}
const head = source.slice(0, source.indexOf('\n', begin) + 1);
writeFileSync(LIST, `${head}${generated}\n${source.slice(end - 2)}`);

console.log(
  `\n${entries.length} photographs, ${(total / (1024 * 1024)).toFixed(1)} MB in ${OUT}.` +
    (total > TOTAL_BUDGET_BYTES
      ? `\nThat is over the ${TOTAL_BUDGET_BYTES / (1024 * 1024)} MB this project tries to stay under. Drop a few, or crop them smaller.`
      : ''),
);
console.log(`${LIST} rewritten. Commit both, push to main, and Cloudflare serves them.`);
