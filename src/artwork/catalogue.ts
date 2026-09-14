/**
 * The catalogue: every piece the studio has, and what happened to it.
 *
 * Almost none of this is new. A picture already carries its title, size,
 * medium, year, price and status — this is the model for seeing them all at
 * once instead of one at a time, and for the two things a picture could not
 * say before: **where it is**, and **what happened when it sold**.
 *
 * A sale is kept on the piece rather than in a ledger of its own, because a
 * piece sells once. When the money tool comes it reads these rows; until then
 * the CSV does the same job for a spreadsheet or an accountant.
 *
 * The honesty rules are the ones the rest of the app runs on:
 *
 *  - Unknown stays unknown. A piece that never had a price is null and reads
 *    "Price on request"; a sale with no figure recorded is null, never 0.
 *  - A total says how many rows it could actually see. Adding up eleven sales
 *    when two of them have no figure and calling it the year's income is the
 *    kind of number that ends up on a tax return.
 *  - Nothing is inferred. A piece is sold because the artist said so.
 *
 * Money here is integer minor units, as everywhere else in the app —
 * `formatMoney` and `parseMoney` in commission/calc.ts. Note that a picture's
 * *asking* price is a plain number in major units, which is older and stays
 * as it is; `askingInMinor` is the one place the two meet.
 *
 * DOM-free, like the rest of the model layer.
 */

/** Integer minor units, as the money in the rest of the app is kept. */
type Minor = number;
import { describePrice, statusOf, type Photo } from '../photo/photo';

/** Where a piece physically is. Null until the artist says. */
export type PieceLocation = 'studio' | 'show' | 'gallery' | 'loan' | 'client' | 'storage';

export const LOCATIONS: { id: PieceLocation; label: string }[] = [
  { id: 'studio', label: 'In the studio' },
  { id: 'show', label: 'At a show' },
  { id: 'gallery', label: 'With a gallery' },
  { id: 'loan', label: 'On loan' },
  { id: 'client', label: 'With the client' },
  { id: 'storage', label: 'In storage' },
];

export function describeLocation(location: PieceLocation | null | undefined): string {
  if (!location) return 'Not said';
  return LOCATIONS.find((one) => one.id === location)?.label ?? 'Not said';
}

/**
 * What happened when a piece sold. Every field except the date can be left
 * unknown — a piece often sells before the paperwork catches up.
 */
export interface Sale {
  /** yyyy-mm-dd. The one thing a sale always has. */
  date: string;
  /** What it sold for, in minor units. Null = not recorded, never zero. */
  amount: Minor | null;
  /** Where it sold: a show's name, a gallery, "studio visit", anything. */
  where: string | null;
  /** Who bought it, when they said. */
  buyer: string | null;
  /** What the gallery or show took, in minor units. Null = not recorded. */
  fee: Minor | null;
  note: string | null;
}

export function emptySale(date = new Date().toISOString().slice(0, 10)): Sale {
  return { date, amount: null, where: null, buyer: null, fee: null, note: null };
}

/** The asking price in minor units, for prefilling a sale. */
export function askingInMinor(photo: Photo): Minor | null {
  return photo.price === null ? null : Math.round(photo.price * 100);
}

/**
 * What the studio kept: the amount less whatever was taken off it. Null when
 * either figure is missing — a net worked out from a guess is worse than no
 * net at all.
 */
export function netOf(sale: Sale): Minor | null {
  if (sale.amount === null) return null;
  if (sale.fee === null) return sale.amount;
  return sale.amount - sale.fee;
}

export function isSold(photo: Photo): boolean {
  return statusOf(photo) === 'sold' || Boolean(photo.sale);
}

// --- Looking through them ---------------------------------------------------

export type PieceFilter = 'all' | 'available' | 'sold' | 'nfs' | 'unsaid' | 'unpriced';

export type SortKey = 'newest' | 'oldest' | 'title' | 'price-high' | 'price-low' | 'size';

export function matchesFilter(photo: Photo, filter: PieceFilter): boolean {
  switch (filter) {
    case 'available':
      return statusOf(photo) === 'available';
    case 'sold':
      return isSold(photo);
    case 'nfs':
      return statusOf(photo) === 'nfs';
    case 'unsaid':
      return statusOf(photo) === null;
    case 'unpriced':
      return photo.price === null;
    default:
      return true;
  }
}

/** Title, medium, year, where it sold, who bought it. Not the private note. */
export function matchesSearch(photo: Photo, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    photo.title,
    photo.medium,
    photo.year ? String(photo.year) : null,
    photo.sale?.where ?? null,
    photo.sale?.buyer ?? null,
  ]
    .filter((field): field is string => Boolean(field))
    .some((field) => field.toLowerCase().includes(needle));
}

export function sortPieces(photos: Photo[], key: SortKey): Photo[] {
  const sorted = [...photos];
  switch (key) {
    case 'oldest':
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    // A piece with no price is not a cheap piece, and not an expensive one:
    // unpriced work sinks to the bottom whichever way the list is sorted,
    // rather than being read as zero at one end of it.
    case 'price-high':
      return sorted.sort((a, b) => byPrice(a, b, -1));
    case 'price-low':
      return sorted.sort((a, b) => byPrice(a, b, 1));
    case 'size':
      return sorted.sort((a, b) => (areaOf(b) ?? -1) - (areaOf(a) ?? -1));
    default:
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function byPrice(a: Photo, b: Photo, direction: 1 | -1): number {
  if (a.price === null && b.price === null) return 0;
  if (a.price === null) return 1;
  if (b.price === null) return -1;
  return direction * (a.price - b.price);
}

function areaOf(photo: Photo): number | null {
  if (photo.widthIn === null || photo.heightIn === null) return null;
  return photo.widthIn * photo.heightIn;
}

/** Filter, search and sort in one, so every view agrees on what it is showing. */
export function shownPieces(
  photos: Photo[],
  options: { filter: PieceFilter; query: string; sort: SortKey },
): Photo[] {
  return sortPieces(
    photos.filter((photo) => matchesFilter(photo, options.filter) && matchesSearch(photo, options.query)),
    options.sort,
  );
}

// --- Counting them ----------------------------------------------------------

export interface Summary {
  total: number;
  available: number;
  sold: number;
  nfs: number;
  unsaid: number;
  unpriced: number;
}

export function summarise(photos: Photo[]): Summary {
  return {
    total: photos.length,
    available: photos.filter((photo) => statusOf(photo) === 'available').length,
    sold: photos.filter(isSold).length,
    nfs: photos.filter((photo) => statusOf(photo) === 'nfs').length,
    unsaid: photos.filter((photo) => statusOf(photo) === null).length,
    unpriced: photos.filter((photo) => photo.price === null).length,
  };
}

/** "42 pieces · 9 with no price yet", or the honest silence of an empty studio. */
export function describeSummary(summary: Summary): string {
  if (summary.total === 0) return 'Nothing in the catalogue yet';
  const parts = [`${summary.total} ${summary.total === 1 ? 'piece' : 'pieces'}`];
  if (summary.available) parts.push(`${summary.available} available`);
  if (summary.sold) parts.push(`${summary.sold} sold`);
  if (summary.unpriced) parts.push(`${summary.unpriced} with no price yet`);
  return parts.join(' · ');
}

export interface SalesTotal {
  /** The sum of the sales that had a figure, in minor units. */
  gross: Minor;
  /** What was kept after what galleries and shows took. */
  net: Minor;
  /** How many sales went into it. */
  counted: number;
  /** How many sales had no figure and so are not in it. */
  missing: number;
}

/**
 * Adds up the sales, and says what it could not see.
 *
 * A total that quietly leaves out three sales with no figure is the number
 * that ends up on a tax return, so `missing` is part of the answer rather
 * than a footnote somebody has to go and look for.
 */
export function salesTotal(photos: Photo[], year?: number): SalesTotal {
  const sales = photos
    .map((photo) => photo.sale)
    .filter((sale): sale is Sale => Boolean(sale))
    .filter((sale) => (year === undefined ? true : sale.date.startsWith(String(year))));

  let gross = 0;
  let net = 0;
  let counted = 0;
  let missing = 0;
  for (const sale of sales) {
    if (sale.amount === null) {
      missing += 1;
      continue;
    }
    gross += sale.amount;
    net += netOf(sale) ?? sale.amount;
    counted += 1;
  }
  return { gross, net, counted, missing };
}

/** The years that actually have a sale in them, newest first. */
export function saleYears(photos: Photo[]): number[] {
  const years = new Set<number>();
  for (const photo of photos) {
    if (photo.sale) years.add(Number(photo.sale.date.slice(0, 4)));
  }
  return [...years].filter((year) => Number.isFinite(year)).sort((a, b) => b - a);
}

/** A piece with a sale on it, so the rows below can read it without a guard. */
export type SoldPiece = Photo & { sale: Sale };

export function soldPieces(photos: Photo[], year?: number): SoldPiece[] {
  return photos
    .filter((photo): photo is SoldPiece => Boolean(photo.sale))
    .filter((photo) => (year === undefined ? true : photo.sale.date.startsWith(String(year))))
    .sort((a, b) => b.sale.date.localeCompare(a.sale.date));
}

// --- Handing it to a spreadsheet -------------------------------------------

/** Every piece, for a stock take. */
export function catalogueCsv(photos: Photo[]): string {
  const header = [
    'Title',
    'Width (in)',
    'Height (in)',
    'Medium',
    'Year',
    'Asking price',
    'Currency',
    'Status',
    'Where it is',
    'Sold on',
    'Sold for',
    'Fee taken',
    'Kept',
    'Sold where',
    'Buyer',
  ];
  const rows = photos.map((photo) => [
    photo.title,
    photo.widthIn === null ? '' : String(photo.widthIn),
    photo.heightIn === null ? '' : String(photo.heightIn),
    photo.medium ?? '',
    photo.year === null ? '' : String(photo.year),
    photo.price === null ? '' : String(photo.price),
    photo.currency,
    statusOf(photo) ?? '',
    photo.location ?? '',
    photo.sale?.date ?? '',
    money(photo.sale?.amount ?? null),
    money(photo.sale?.fee ?? null),
    money(photo.sale ? netOf(photo.sale) : null),
    photo.sale?.where ?? '',
    photo.sale?.buyer ?? '',
  ]);
  return toCsv([header, ...rows]);
}

/** Only what sold, which is the sheet an accountant asks for. */
export function salesCsv(photos: Photo[], year?: number): string {
  const header = ['Date', 'Title', 'Sold for', 'Fee taken', 'Kept', 'Where', 'Buyer', 'Currency', 'Note'];
  const rows = soldPieces(photos, year).map((photo) => [
    photo.sale.date,
    photo.title,
    money(photo.sale.amount),
    money(photo.sale.fee),
    money(netOf(photo.sale)),
    photo.sale.where ?? '',
    photo.sale.buyer ?? '',
    photo.currency,
    photo.sale.note ?? '',
  ]);
  return toCsv([header, ...rows]);
}

/**
 * An empty cell for an amount nobody recorded. Writing 0 there would be a
 * figure the artist never gave, and it would add up.
 */
function money(amount: Minor | null): string {
  return amount === null ? '' : (amount / 100).toFixed(2);
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/**
 * A spreadsheet treats a cell starting with = + - @ as a formula, so a title
 * like "=cmd" would run in Excel. Prefixing an apostrophe keeps the text.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

// --- What a client is shown -------------------------------------------------

/**
 * The line under a piece in the client's view. It never says what something
 * sold for, and never shows a status the artist has not set.
 */
export function clientLine(photo: Photo): string {
  const parts: string[] = [];
  if (photo.widthIn !== null && photo.heightIn !== null) {
    parts.push(`${trim(photo.widthIn)} × ${trim(photo.heightIn)} in`);
  }
  if (photo.medium) parts.push(photo.medium);
  if (photo.year) parts.push(String(photo.year));
  parts.push(isSold(photo) ? 'Sold' : describePrice(photo));
  return parts.join(' · ');
}

/** What a client browsing the library is allowed to see. */
export function clientPieces(photos: Photo[], options: { showSold: boolean }): Photo[] {
  return photos.filter((photo) => (options.showSold ? true : !isSold(photo)));
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
