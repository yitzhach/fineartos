/**
 * The three sheets an artist prints for a show: the price list, wall labels,
 * and a certificate of authenticity. DOM-free: each is a whole HTML document
 * as a string, which the window prints through a hidden frame.
 *
 * The rules that hold everywhere else hold on paper too. A piece with no
 * price reads "Price on request", never $0; a size, medium or year nobody
 * recorded is left off, never guessed; and an artist with no name set gets a
 * blank line to write on, not a made-up one.
 */
import { describePrice, describeSize, statusOf, type Photo } from '../photo/photo';
import type { Show } from './shows';
import { describeDates } from './shows';

export interface PrintStudio {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** What a printed price line says: sold, not for sale, a price, or on request. */
export function printedPrice(photo: Photo): string {
  if (photo.sale || statusOf(photo) === 'sold') return 'Sold';
  if (statusOf(photo) === 'nfs') return 'Not for sale';
  return describePrice(photo);
}

/** Size · medium · year — whichever were recorded, in that order. */
export function detailLine(photo: Photo): string {
  return [describeSize(photo), photo.medium?.trim() || null, photo.year ? String(photo.year) : null]
    .filter(Boolean)
    .join(' · ');
}

const BASE_CSS = `
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11pt/1.45 Georgia, 'Times New Roman', serif; color: #1a1713; background: #fff; }
  h1 { font-weight: 400; font-size: 20pt; margin: 0 0 2pt; }
  .sub { color: #5c554b; font-size: 10pt; margin: 0 0 14pt; }
  .muted { color: #5c554b; }
`;

function page(title: string, css: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

function showLine(show: Show): string {
  return [show.venue, describeDates(show)].filter(Boolean).join(' · ');
}

export function priceListHtml(show: Show, pieces: Photo[], studio: PrintStudio): string {
  const rows = pieces
    .map(
      (photo, i) => `<tr><td class="n">${i + 1}</td><td><strong>${escapeHtml(photo.title || 'Untitled')}</strong>${
        detailLine(photo) ? `<div class="muted">${escapeHtml(detailLine(photo))}</div>` : ''
      }</td><td class="p">${escapeHtml(printedPrice(photo))}</td></tr>`,
    )
    .join('');
  const contact = [studio.email, studio.phone].filter(Boolean).map((v) => escapeHtml(v!)).join(' · ');
  return page(
    `Price list — ${show.name}`,
    `table { width: 100%; border-collapse: collapse; }
     td { padding: 7pt 4pt; border-bottom: 0.5pt solid #cfc7ba; vertical-align: top; }
     td.n { width: 2.2em; color: #5c554b; } td.p { text-align: right; white-space: nowrap; }
     footer { margin-top: 16pt; font-size: 9.5pt; color: #5c554b; }`,
    `<h1>${escapeHtml(studio.name?.trim() || 'Price list')}</h1>
     <p class="sub">${escapeHtml(show.name)}${showLine(show) ? ` · ${escapeHtml(showLine(show))}` : ''}</p>
     <table>${rows}</table>
     ${contact ? `<footer>${contact}</footer>` : ''}`,
  );
}

/** Labels 3.5 × 2 in, as many to a sheet as fit — cut along the faint lines. */
export function wallLabelsHtml(pieces: Photo[], studio: PrintStudio): string {
  const artist = studio.name?.trim() || null;
  const labels = pieces
    .map(
      (photo) => `<div class="label">
        ${artist ? `<div class="artist">${escapeHtml(artist)}</div>` : ''}
        <div class="title">${escapeHtml(photo.title || 'Untitled')}</div>
        ${detailLine(photo) ? `<div class="muted">${escapeHtml(detailLine(photo))}</div>` : ''}
        <div class="price">${escapeHtml(printedPrice(photo))}</div>
      </div>`,
    )
    .join('');
  return page(
    'Wall labels',
    `.sheet { display: flex; flex-wrap: wrap; gap: 0; }
     .label { width: 3.5in; height: 2in; padding: 0.22in 0.25in; border: 0.5pt dashed #cfc7ba; display: flex; flex-direction: column; gap: 3pt; break-inside: avoid; overflow: hidden; }
     .artist { font-size: 9pt; letter-spacing: 0.06em; text-transform: uppercase; color: #5c554b; }
     .title { font-size: 13pt; font-style: italic; }
     .muted { font-size: 9.5pt; }
     .price { margin-top: auto; font-size: 11pt; }`,
    `<div class="sheet">${labels}</div>`,
  );
}

/**
 * A certificate for one piece. It certifies what the artist puts their name
 * to; the signature is theirs, in ink, on the line.
 */
export function certificateHtml(
  photo: Photo,
  studio: PrintStudio,
  imageUrl: string | null,
  today: string,
): string {
  const artist = studio.name?.trim() || null;
  const facts: [string, string | null][] = [
    ['Title', photo.title || 'Untitled'],
    ['Year', photo.year ? String(photo.year) : null],
    ['Medium', photo.medium?.trim() || null],
    ['Size', describeSize(photo)],
  ];
  const rows = facts
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `<tr><th>${k}</th><td>${escapeHtml(v!)}</td></tr>`)
    .join('');
  return page(
    `Certificate of authenticity — ${photo.title}`,
    `body { padding: 0.4in; }
     .frame { border: 1.5pt solid #1a1713; padding: 0.45in; min-height: 9in; display: flex; flex-direction: column; gap: 16pt; }
     h1 { text-align: center; font-size: 22pt; letter-spacing: 0.04em; }
     img { display: block; max-width: 60%; max-height: 3.2in; margin: 0 auto; }
     table { margin: 0 auto; border-collapse: collapse; } th { text-align: left; font-weight: 400; color: #5c554b; padding: 3pt 14pt 3pt 0; } td { padding: 3pt 0; }
     .stmt { text-align: center; max-width: 5.5in; margin: 0 auto; }
     .sign { margin-top: auto; display: flex; justify-content: space-between; gap: 24pt; }
     .line { flex: 1; border-top: 0.75pt solid #1a1713; padding-top: 4pt; font-size: 9.5pt; color: #5c554b; }`,
    `<div class="frame">
      <h1>Certificate of Authenticity</h1>
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : ''}
      <table>${rows}</table>
      <p class="stmt">This certifies that the work described above is an original work by ${
        artist ? escapeHtml(artist) : '______________________________'
      }.</p>
      <div class="sign"><div class="line">Signature</div><div class="line">Date${today ? ` — ${escapeHtml(today)}` : ''}</div></div>
    </div>`,
  );
}
