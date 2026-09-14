/**
 * Where the money came from.
 *
 * Two streams, kept apart on purpose:
 *
 *  - **Payments received against an invoice.** Money that actually arrived,
 *    with a date somebody wrote down.
 *  - **Sales recorded on a piece** in the catalogue.
 *
 * A piece sold *and* invoiced is the same money twice, and nothing in the app
 * can tell on its own — there is no link between an invoice and a piece. So
 * the artist says: a sale marked as invoiced drops out of the catalogue
 * stream and the invoice payments stand for it. Until it is marked, both are
 * shown, and the tool says plainly that they may be the same money.
 *
 * DOM-free, like the rest of the model layer.
 */

import type { Invoice } from '../invoice/types';
import type { Photo } from '../photo/photo';
import type { IncomeRow } from './ledger';

/** Every payment on every invoice, as rows. */
export function incomeFromInvoices(invoices: Invoice[]): IncomeRow[] {
  return invoices.flatMap((invoice) =>
    invoice.payments.map((payment) => ({
      id: `invoice:${invoice.id}:${payment.id}`,
      source: 'invoice' as const,
      date: payment.date,
      what: `Invoice ${invoice.invoiceNumber}${payment.note ? ` — ${payment.note}` : ''}`,
      amount: payment.amount,
      // A payment is what arrived; nothing is taken off it here.
      fee: null,
      who: invoice.client.name || null,
      invoiceId: invoice.id,
      photoId: null,
    })),
  );
}

/**
 * Sales written on a piece. One marked as invoiced is left out — the invoice
 * payment is that money, and counting both would be counting it twice.
 */
export function incomeFromPieces(photos: Photo[]): IncomeRow[] {
  return photos
    .filter((photo) => photo.sale && !photo.sale.invoiced)
    .map((photo) => ({
      id: `piece:${photo.id}`,
      source: 'piece' as const,
      date: photo.sale!.date,
      what: photo.title,
      amount: photo.sale!.amount,
      fee: photo.sale!.fee,
      who: photo.sale!.buyer ?? photo.sale!.where ?? null,
      invoiceId: null,
      photoId: photo.id,
    }));
}

export function allIncome(input: { invoices: Invoice[]; photos: Photo[] }): IncomeRow[] {
  return [...incomeFromInvoices(input.invoices), ...incomeFromPieces(input.photos)];
}

/** Pieces whose sale has been marked as already invoiced, for the list to show. */
export function invoicedPieces(photos: Photo[]): Photo[] {
  return photos.filter((photo) => photo.sale?.invoiced === true);
}
