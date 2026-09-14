/**
 * What the client actually receives: a card drawn on a canvas, and one
 * self-contained page.
 *
 * Both render from the records rather than from the screen, the same way the
 * invoice does, so an export cannot pick up app chrome or a half-scrolled
 * window, and the HTML can be tested without a browser layout.
 *
 * The page is one file with its pictures inlined. Its two buttons compose a
 * reply *in the reader's own mail or messages app* — this app has no server
 * and cannot receive anything, so the reply travels the way every other
 * message that person sends does. The page says as much at the bottom rather
 * than leaving them to wonder where a click went.
 */

import { escapeHtml, formatDate } from '../invoice/render';
import type { ClientUpdate } from './updates';

export interface CardPicture {
  /** A data: URI for the page, or any URL for the canvas. */
  src: string;
  title: string;
}

export interface CardContext {
  studioName: string | null;
  studioEmail: string | null;
  clientName: string | null;
  title: string | null;
  documentNumber: string | null;
  /** yyyy-mm-dd. The date on the card, not the moment it was rendered. */
  date: string;
  stage: string | null;
}

/** The file name a saved card gets, without an extension. */
export function cardFileStem(update: ClientUpdate, context: CardContext): string {
  const parts = [context.title ?? 'update', update.headline, context.date];
  return parts
    .join(' ')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/**
 * Draws the card. One picture large, up to three more along the bottom: a
 * message thread shows one image, so the first one has to carry it.
 */
export function drawUpdateCard(
  canvas: HTMLCanvasElement,
  update: ClientUpdate,
  context: CardContext,
  pictures: HTMLImageElement[],
  scale = 2,
): void {
  const W = 900;
  const PAD = 56;
  const hero = pictures[0] ?? null;
  const rest = pictures.slice(1, 4);

  const heroHeight = hero ? Math.round(Math.min(560, (W - PAD * 2) * (hero.height / hero.width))) : 0;
  const noteLines = update.note ? wrap(update.note, 62) : [];
  const height =
    150 +
    (hero ? heroHeight + 28 : 0) +
    (rest.length ? 130 : 0) +
    noteLines.length * 26 +
    (update.asksApproval ? 70 : 0) +
    92;

  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser did not provide a 2D canvas context.');
  ctx.scale(scale, scale);

  const SERIF = 'Georgia, "Times New Roman", serif';
  const SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const INK = '#241f19';
  const SOFT = '#6b6459';

  ctx.fillStyle = '#faf7f1';
  ctx.fillRect(0, 0, W, height);

  let y = PAD;
  ctx.fillStyle = SOFT;
  ctx.font = `12px ${SANS}`;
  ctx.fillText((context.studioName ?? 'Studio').toUpperCase(), PAD, y);
  ctx.textAlign = 'right';
  ctx.fillText(formatDate(context.date), W - PAD, y);
  ctx.textAlign = 'left';

  y += 34;
  ctx.fillStyle = INK;
  ctx.font = `26px ${SERIF}`;
  ctx.fillText(update.headline, PAD, y);

  y += 24;
  ctx.fillStyle = SOFT;
  ctx.font = `13px ${SANS}`;
  const line = [context.title, context.stage, context.documentNumber].filter(Boolean).join(' · ');
  if (line) ctx.fillText(line, PAD, y);

  y += 26;
  if (hero) {
    ctx.drawImage(hero, PAD, y, W - PAD * 2, heroHeight);
    y += heroHeight + 28;
  }

  if (rest.length) {
    const size = 110;
    const gap = 14;
    rest.forEach((picture, index) => {
      ctx.drawImage(picture, PAD + index * (size + gap), y, size, size);
    });
    y += 130;
  }

  if (noteLines.length) {
    ctx.fillStyle = INK;
    ctx.font = `16px ${SERIF}`;
    for (const text of noteLines) {
      ctx.fillText(text, PAD, y);
      y += 26;
    }
    y += 6;
  }

  if (update.asksApproval) {
    ctx.fillStyle = '#e6d9c1';
    ctx.fillRect(PAD, y - 18, W - PAD * 2, 46);
    ctx.fillStyle = INK;
    ctx.font = `14px ${SANS}`;
    ctx.fillText('Happy for me to carry on from here? A reply is enough.', PAD + 16, y + 10);
    y += 70;
  }

  ctx.fillStyle = SOFT;
  ctx.font = `12px ${SANS}`;
  const foot = [context.studioName, context.studioEmail].filter(Boolean).join(' · ');
  if (foot) ctx.fillText(foot, PAD, height - PAD + 12);
}

/**
 * One self-contained page. Pictures are inlined, so it opens from a download
 * folder years later with no app and no network.
 */
export function renderUpdateHtml(
  update: ClientUpdate,
  context: CardContext,
  pictures: CardPicture[],
): string {
  const subject = [context.title, update.headline].filter(Boolean).join(' — ');
  const to = context.studioEmail ?? '';
  const reply = (outcome: string) =>
    `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      `${outcome}: ${subject}`,
    )}&body=${encodeURIComponent(`${outcome} — ${subject}\n\n`)}`;

  const images = pictures
    .map(
      (picture) =>
        `<figure><img src="${escapeHtml(picture.src)}" alt="${escapeHtml(picture.title)}" />` +
        `<figcaption>${escapeHtml(picture.title)}</figcaption></figure>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject || 'Update')}</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 28px 20px 60px;
    background: #faf7f1;
    color: #241f19;
    font: 16px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 720px; margin: 0 auto; }
  .who { display: flex; justify-content: space-between; font-size: 12px; color: #6b6459; letter-spacing: 0.06em; text-transform: uppercase; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 30px; margin: 14px 0 4px; font-weight: 400; }
  .sub { color: #6b6459; font-size: 14px; margin: 0 0 22px; }
  figure { margin: 0 0 18px; }
  img { width: 100%; height: auto; border-radius: 10px; display: block; }
  figcaption { font-size: 12.5px; color: #6b6459; padding-top: 6px; }
  .note { font-family: Georgia, "Times New Roman", serif; font-size: 17px; white-space: pre-wrap; }
  .ask { margin: 26px 0 8px; padding: 18px; background: #f1e7d4; border-radius: 12px; }
  .ask p { margin: 0 0 12px; }
  .btn { display: inline-block; padding: 11px 18px; margin: 0 8px 8px 0; border-radius: 9px; background: #241f19; color: #faf7f1; text-decoration: none; font-size: 15px; }
  .btn.quiet { background: transparent; color: #241f19; border: 1px solid #c9c1b3; }
  footer { margin-top: 34px; padding-top: 14px; border-top: 1px solid #e2dbcd; font-size: 12.5px; color: #6b6459; }
</style>
</head>
<body>
<main>
  <div class="who">
    <span>${escapeHtml(context.studioName ?? 'Studio')}</span>
    <span>${escapeHtml(formatDate(context.date))}</span>
  </div>
  <h1>${escapeHtml(update.headline)}</h1>
  <p class="sub">${escapeHtml(
    [context.title, context.stage, context.documentNumber].filter(Boolean).join(' · '),
  )}</p>
  ${images}
  ${update.note ? `<p class="note">${escapeHtml(update.note)}</p>` : ''}
  ${
    update.asksApproval
      ? `<div class="ask">
    <p>Happy for me to carry on from here?</p>
    ${
      // A button with no address behind it opens a blank email, which is
      // worse than no button. With no studio address the page asks for a
      // reply in words instead.
      to
        ? `<a class="btn" href="${escapeHtml(reply('Approved'))}">Approve</a>
    <a class="btn quiet" href="${escapeHtml(reply('Changes please'))}">Ask for a change</a>`
        : `<p class="sub">Just reply however you normally reach ${escapeHtml(
            context.studioName ?? 'the studio',
          )} — a yes is enough.</p>`
    }
  </div>`
      : ''
  }
  <footer>
    ${
      [context.studioName, context.studioEmail].filter(Boolean).length
        ? `${escapeHtml([context.studioName, context.studioEmail].filter(Boolean).join(' · '))}<br />`
        : ''
    }
    ${
      to
        ? 'These buttons open your own email so you can reply — this page cannot send anything by itself, and nobody is told whether you opened it.'
        : 'This page cannot send anything by itself, and nobody is told whether you opened it.'
    }
  </footer>
</main>
</body>
</html>`;
}

/** Wraps a note to a rough character width, for the canvas. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line === '') line = word;
      else if (`${line} ${word}`.length <= width) line = `${line} ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  // A dozen lines is a letter, not an update; the page carries the rest.
  return lines.slice(0, 12);
}

/**
 * The same update, laid out for paper.
 *
 * A printed sheet has nothing to click, so the two reply buttons come off and
 * the studio's address is printed as words instead — a dead button on paper
 * is worse than none. Everything else is the page: white ground, the pictures
 * inlined, and page breaks told where not to fall.
 */
export function renderUpdatePrintHtml(
  update: ClientUpdate,
  context: CardContext,
  pictures: CardPicture[],
): string {
  const subject = [context.title, update.headline].filter(Boolean).join(' — ');
  const images = pictures
    .map(
      (picture) =>
        `<figure><img src="${escapeHtml(picture.src)}" alt="${escapeHtml(picture.title)}" />` +
        `<figcaption>${escapeHtml(picture.title)}</figcaption></figure>`,
    )
    .join('\n');
  const reachUs = context.studioEmail
    ? `Reply to ${escapeHtml(context.studioEmail)}, or however you normally reach ${escapeHtml(
        context.studioName ?? 'the studio',
      )} — a yes is enough.`
    : `Reply however you normally reach ${escapeHtml(
        context.studioName ?? 'the studio',
      )} — a yes is enough.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(subject || 'Update')}</title>
<style>
  @page { margin: 16mm; }
  :root { color-scheme: light; }
  body {
    margin: 0;
    background: #ffffff;
    color: #000000;
    font: 11.5pt/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 7in; margin: 0 auto; }
  .who { display: flex; justify-content: space-between; font-size: 9pt; color: #4a453d; letter-spacing: 0.06em; text-transform: uppercase; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 22pt; margin: 10pt 0 2pt; font-weight: 400; break-after: avoid; }
  .sub { color: #4a453d; font-size: 10pt; margin: 0 0 16pt; }
  figure { margin: 0 0 12pt; break-inside: avoid; }
  img { width: 100%; height: auto; display: block; }
  figcaption { font-size: 9pt; color: #4a453d; padding-top: 4pt; }
  .note { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; white-space: pre-wrap; orphans: 3; widows: 3; }
  .ask { margin: 18pt 0 0; padding: 10pt 12pt; border: 1pt solid #c9c1b3; break-inside: avoid; }
  .ask p { margin: 0 0 6pt; }
  .ask p:last-child { margin: 0; }
  footer { margin-top: 22pt; padding-top: 8pt; border-top: 1pt solid #c9c1b3; font-size: 9pt; color: #4a453d; break-inside: avoid; }
</style>
</head>
<body>
<main>
  <div class="who">
    <span>${escapeHtml(context.studioName ?? 'Studio')}</span>
    <span>${escapeHtml(formatDate(context.date))}</span>
  </div>
  <h1>${escapeHtml(update.headline)}</h1>
  <p class="sub">${escapeHtml(
    [context.title, context.stage, context.documentNumber].filter(Boolean).join(' · '),
  )}</p>
  ${images}
  ${update.note ? `<p class="note">${escapeHtml(update.note)}</p>` : ''}
  ${
    update.asksApproval
      ? `<div class="ask">
    <p>Happy for me to carry on from here?</p>
    <p class="sub">${reachUs}</p>
  </div>`
      : ''
  }
  <footer>
    ${
      [context.studioName, context.studioEmail].filter(Boolean).length
        ? `${escapeHtml([context.studioName, context.studioEmail].filter(Boolean).join(' · '))}<br />`
        : ''
    }
    Printed from the studio's own records. Nobody is told whether you read it.
  </footer>
</main>
</body>
</html>`;
}
