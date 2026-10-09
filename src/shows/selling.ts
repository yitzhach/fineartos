/**
 * Selling at a show, DOM-free.
 *
 * One act changes three places, and they must agree: the piece (sold, gone
 * with the buyer, the sale written on it), the books (which read the sale off
 * the piece — `finance/income.ts` — so there is nothing extra to write), and
 * the show's tally (which reads the same sales by `showId`).
 *
 * Taking a sale back goes through the Trash like anything else. The sale
 * moves into the piece's own `trashedSales` and the piece reads what it read
 * before; Put back undoes exactly that; emptying the Trash drops it for good.
 * Keeping the trashed sale on the piece, not in the Trash list, means an edit
 * to the piece in the meantime cannot lose it.
 */
import { newId } from '../commission/document';
import { formatMoney } from '../commission/calc';
import type { Minor } from '../commission/types';
import { askingInMinor, type Sale } from '../artwork/catalogue';
import { editPhoto, statusOf, type Photo } from '../photo/photo';
import type { Show } from './shows';

export interface SaleInput {
  /** Minor units. Null = not recorded — never a stand-in zero. */
  amount: Minor | null;
  buyer: string | null;
}

/** What the sale form starts with: the asking price, nobody named. */
export function saleDefaults(photo: Photo): SaleInput {
  return { amount: askingInMinor(photo), buyer: null };
}

/** Why this piece cannot be sold here, or null. */
export function cannotSell(photo: Photo): string | null {
  if (photo.sale) return 'Already sold.';
  if (statusOf(photo) === 'nfs') return 'Marked not for sale.';
  return null;
}

/** The piece, sold at this show: status, where it is, and the sale on it. */
export function sellAtShow(photo: Photo, show: Show, input: SaleInput, today: string, now = new Date()): Photo {
  const sale: Sale = {
    id: newId(),
    showId: show.id,
    date: today,
    amount: input.amount,
    where: show.name,
    buyer: input.buyer?.trim() || null,
    fee: null,
    note: null,
    before: { status: statusOf(photo), location: photo.location ?? null },
  };
  return editPhoto(photo, { status: 'sold', location: 'client', sale }, now);
}

/** A show sale can go to the Trash on its own; an older, hand-written sale cannot. */
export function trashableSale(photo: Photo): Sale | null {
  return photo.sale?.id && photo.sale.before ? photo.sale : null;
}

/** The sale moved to the Trash: the piece reads what it read before. */
export function trashSale(photo: Photo, saleId: string, now = new Date()): Photo | null {
  const sale = photo.sale;
  if (!sale || sale.id !== saleId || !sale.before) return null;
  return editPhoto(
    photo,
    {
      status: sale.before.status,
      location: sale.before.location,
      sale: null,
      trashedSales: [...(photo.trashedSales ?? []), sale],
    },
    now,
  );
}

/**
 * The sale back from the Trash. A string when it cannot be: the piece has
 * been sold again since, and two sales of one piece would be a lie.
 */
export function putSaleBack(photo: Photo, saleId: string, now = new Date()): Photo | string {
  const sale = photo.trashedSales?.find((one) => one.id === saleId);
  if (!sale) return 'That sale is no longer on the piece.';
  if (photo.sale) return `“${photo.title}” has been sold again since. Take that sale back first.`;
  return editPhoto(
    photo,
    {
      status: 'sold',
      location: 'client',
      sale,
      trashedSales: photo.trashedSales!.filter((one) => one.id !== saleId),
    },
    now,
  );
}

/** Emptying the Trash: the trashed sale is gone for good. Null if it was not there. */
export function dropTrashedSale(photo: Photo, saleId: string, now = new Date()): Photo | null {
  if (!photo.trashedSales?.some((one) => one.id === saleId)) return null;
  const rest = photo.trashedSales.filter((one) => one.id !== saleId);
  return editPhoto(photo, { trashedSales: rest.length ? rest : undefined }, now);
}

export interface ShowTally {
  /** Pieces sold at this show, in the order sold. */
  sold: Photo[];
  /** The sum of the sales with a figure, per currency. */
  totals: { currency: string; amount: Minor }[];
  /** Sales with no figure recorded — left out of the totals, and said. */
  missing: number;
  /** Pieces the show took that have not sold. */
  stillOut: Photo[];
}

export function showTally(show: Show, photos: Photo[]): ShowTally {
  const sold = photos
    .filter((photo) => photo.sale?.showId === show.id)
    .sort((a, b) => (a.sale!.date + a.updatedAt).localeCompare(b.sale!.date + b.updatedAt));
  const byCurrency = new Map<string, Minor>();
  let missing = 0;
  for (const photo of sold) {
    const amount = photo.sale!.amount;
    if (amount === null) missing += 1;
    else byCurrency.set(photo.currency, (byCurrency.get(photo.currency) ?? 0) + amount);
  }
  const stillOut = show.pieceIds
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is Photo => Boolean(photo) && !photo!.sale);
  return {
    sold,
    totals: [...byCurrency].map(([currency, amount]) => ({ currency, amount })),
    missing,
    stillOut,
  };
}

/** The tally in one line: "2 sold · $1,200.00 · 1 with no price recorded, left out · 4 still out". */
export function describeTally(tally: ShowTally): string {
  const parts = [`${tally.sold.length} sold`];
  for (const total of tally.totals) parts.push(formatMoney(total.amount, total.currency));
  if (tally.missing) parts.push(`${tally.missing} with no price recorded, left out`);
  parts.push(`${tally.stillOut.length} still out`);
  return parts.join(' · ');
}

/**
 * A receipt the artist hands to the phone's mail or messages app. It says
 * what was bought and for how much; it never says it was sent (rule 4).
 */
export function receiptText(photo: Photo, studioName: string | null): { subject: string; body: string } {
  const sale = photo.sale;
  const from = studioName?.trim() || 'the artist';
  const lines = [
    sale?.buyer ? `Thank you, ${sale.buyer}.` : 'Thank you.',
    '',
    `Receipt from ${from}`,
    `“${photo.title}”`,
  ];
  if (photo.widthIn !== null && photo.heightIn !== null) lines.push(`${photo.widthIn} × ${photo.heightIn} in`);
  if (photo.medium) lines.push(photo.medium);
  if (sale) {
    lines.push(`Date: ${sale.date}`);
    if (sale.where) lines.push(`At: ${sale.where}`);
    // An amount nobody recorded is left off, never printed as $0.
    if (sale.amount !== null) lines.push(`Amount: ${formatMoney(sale.amount, photo.currency)}`);
  }
  return { subject: `Receipt — ${photo.title}`, body: lines.join('\n') };
}
