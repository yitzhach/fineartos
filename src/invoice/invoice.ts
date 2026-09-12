/**
 * Invoice lifecycle: number it, generate it from a commission, issue it.
 *
 * DOM-free on purpose, like calc.ts — a phone app or a future server can reuse
 * every function here without a browser.
 */

import { newId } from '../commission/document';
import type { CommissionDocument, LineItem, Payment } from '../commission/types';
import type { PaymentInstructions } from '../lib/prefs';
import type { Invoice } from './types';

/** Invoice numbers are their own series, separate from commission numbers. */
export function nextInvoiceNumber(existingNumbers: string[], year: number): string {
  const prefix = `INV-${year}-`;
  const highest = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number.parseInt(n.slice(prefix.length), 10))
    .filter((n) => Number.isInteger(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}

/** Adds whole days to a yyyy-mm-dd date, in UTC so no timezone can shift it. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface GenerateOptions {
  /**
   * Which of the commission's line items to bill. Omitted means all of them —
   * the usual case. Naming a subset is how a deposit invoice and a final
   * invoice come off the same commission.
   */
  lineItemIds?: string[];
  /**
   * Whether to carry the commission's recorded payments onto the invoice.
   * Defaults to true so the balance due is right on a final invoice.
   */
  carryPayments?: boolean;
  /** Days until due. Omitted means no due date is set at all, not "due now". */
  netDays?: number;
}

/**
 * Builds an invoice from a commission. The copy is taken now and does not
 * track the commission afterwards: this is the same rule as issuing, applied
 * to money instead of to terms.
 */
export function createInvoiceFromDocument(
  doc: CommissionDocument,
  invoiceNumber: string,
  paymentInstructions: PaymentInstructions,
  options: GenerateOptions = {},
  now = new Date(),
): Invoice {
  const iso = now.toISOString();
  const issueDate = iso.slice(0, 10);
  const { lineItemIds, carryPayments = true, netDays } = options;

  const chosen: LineItem[] = lineItemIds
    ? doc.quote.lineItems.filter((item) => lineItemIds.includes(item.id))
    : doc.quote.lineItems;

  // New ids: an invoice line is its own row, so editing it can never be
  // mistaken for editing the commission's line it was copied from.
  const lineItems = chosen.map((item) => ({ ...item, id: newId() }));
  const payments: Payment[] = carryPayments
    ? doc.payments.map((payment) => ({ ...payment, id: newId() }))
    : [];

  return {
    id: newId(),
    projectId: null,
    sourceDocumentId: doc.id,
    sourceDocumentNumber: doc.documentNumber,
    invoiceNumber,
    issueDate,
    dueDate: netDays === undefined ? null : addDays(issueDate, netDays),
    studio: structuredClone(doc.studio),
    client: structuredClone(doc.client),
    quote: { currency: doc.quote.currency, lineItems, taxRatePct: doc.quote.taxRatePct },
    payments,
    paymentInstructions: structuredClone(paymentInstructions),
    note: null,
    imageIds: [],
    state: 'draft',
    issuedAt: null,
    createdAt: iso,
    updatedAt: iso,
  };
}

/** A blank invoice, for billing something that never had a commission. */
export function createBlankInvoice(
  invoiceNumber: string,
  paymentInstructions: PaymentInstructions,
  now = new Date(),
): Invoice {
  const iso = now.toISOString();
  return {
    id: newId(),
    projectId: null,
    sourceDocumentId: null,
    sourceDocumentNumber: null,
    invoiceNumber,
    issueDate: iso.slice(0, 10),
    dueDate: null,
    studio: { name: '', email: null, phone: null, address: null, logoImageId: null },
    client: { name: '', email: null, phone: null, billingAddress: null, projectAddress: null, source: null },
    quote: {
      currency: 'USD',
      lineItems: [{ id: newId(), kind: 'artwork', description: '', quantity: 1, unitPrice: 0 }],
      taxRatePct: null,
    },
    payments: [],
    paymentInstructions: structuredClone(paymentInstructions),
    note: null,
    imageIds: [],
    state: 'draft',
    issuedAt: null,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function applyInvoiceEdit(
  invoice: Invoice,
  changes: Partial<Invoice>,
  now = new Date(),
): Invoice {
  return {
    ...invoice,
    ...changes,
    id: invoice.id,
    createdAt: invoice.createdAt,
    updatedAt: now.toISOString(),
  };
}

/**
 * Marks the invoice issued. Unlike a commission this keeps no snapshot: an
 * invoice is already a frozen copy of the commission, so the record itself is
 * the thing the client was given.
 */
export function issueInvoice(invoice: Invoice, now = new Date()): Invoice {
  const iso = now.toISOString();
  return { ...invoice, state: 'issued', issuedAt: iso, updatedAt: iso };
}

export function recordInvoicePayment(
  invoice: Invoice,
  payment: Omit<Payment, 'id'>,
  now = new Date(),
): Invoice {
  return {
    ...invoice,
    payments: [...invoice.payments, { ...payment, id: newId() }],
    updatedAt: now.toISOString(),
  };
}

/** A filename stem safe on every platform, e.g. "INV-2026-0004-Ada-Lovelace". */
export function invoiceFileStem(invoice: Invoice): string {
  const client = invoice.client.name.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return client ? `${invoice.invoiceNumber}-${client}` : invoice.invoiceNumber;
}
