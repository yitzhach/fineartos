/**
 * What is still owed.
 *
 * A second way to see records that already exist elsewhere — the Invoices
 * window knows what is unpaid, and a commission knows its own balance — put
 * in one list so the artist can see, in one place, what money has not
 * arrived. Nothing here is a new record: every row points at an invoice or a
 * commission, and opening the row opens that.
 *
 * Two rules shape it:
 *
 *  - **Nothing is counted twice.** Once a commission has an invoice generated
 *    from it, the invoice is what is owed; the commission is left out and the
 *    row says which invoices stand for it. A commission with no invoice is the
 *    lingering case, and that is what this list is for.
 *  - **A total says what it could not see.** Invoices are not converted
 *    between currencies — nothing here knows a rate — so totals come back one
 *    per currency, and a draft invoice (never given to anybody) is listed
 *    apart from money actually asked for.
 *
 * DOM-free, like the rest of the model layer.
 */

import { calculateTotals } from '../commission/calc';
import type { CommissionDocument, Minor } from '../commission/types';
import type { Invoice } from '../invoice/types';

const NO_DEPOSIT = { kind: 'percent' as const, value: null };

export type OwedSource = 'invoice' | 'commission';

export interface OwedRow {
  /** Unique across the list: `invoice:<id>` or `commission:<id>`. */
  id: string;
  source: OwedSource;
  /** The record to open when the row is clicked. */
  recordId: string;
  /** INV-2026-0004, or the commission number. */
  ref: string;
  who: string | null;
  /** What it is for, in as many words as the record has. */
  what: string;
  currency: string;
  /** What the whole thing comes to. */
  total: Minor;
  /** What has been paid against it. */
  paid: Minor;
  /** Still owed, always greater than zero on a row in this list. */
  due: Minor;
  /** yyyy-mm-dd, or null when no due date was ever set — not "due today". */
  dueDate: string | null;
  /** The day the clock started: issued, or last touched if never issued. */
  since: string;
  /**
   * True only for an invoice still in draft: it has not been given to
   * anybody, so nobody is late paying it.
   */
  notYetSent: boolean;
}

/** Invoices with a balance left on them. A paid-off invoice drops out. */
export function owedFromInvoices(invoices: Invoice[]): OwedRow[] {
  return invoices.flatMap((invoice) => {
    const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
    if (totals.balance <= 0) return [];
    return [
      {
        id: `invoice:${invoice.id}`,
        source: 'invoice' as const,
        recordId: invoice.id,
        ref: invoice.invoiceNumber,
        who: invoice.client.name.trim() || null,
        what:
          invoice.quote.lineItems.find((item) => item.description.trim())?.description.trim() ??
          'No description on the invoice',
        currency: invoice.quote.currency,
        total: totals.total,
        paid: totals.paid,
        due: totals.balance,
        dueDate: invoice.dueDate,
        since: invoice.issuedAt?.slice(0, 10) ?? invoice.issueDate,
        notYetSent: invoice.state === 'draft',
      },
    ];
  });
}

/**
 * Commissions with money owing and **no invoice raised against them**. Once
 * an invoice exists it is the thing that is owed, and listing both would be
 * the same money twice.
 */
export function owedFromCommissions(
  documents: CommissionDocument[],
  invoices: Invoice[],
): OwedRow[] {
  const invoiced = new Set(
    invoices.map((invoice) => invoice.sourceDocumentId).filter((id): id is string => id !== null),
  );
  return documents.flatMap((doc) => {
    if (doc.state !== 'issued') return [];
    if (invoiced.has(doc.id)) return [];
    const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
    if (totals.balance <= 0) return [];
    const issuedAt = doc.issuedSnapshots.at(-1)?.issuedAt ?? doc.updatedAt;
    return [
      {
        id: `commission:${doc.id}`,
        source: 'commission' as const,
        recordId: doc.id,
        ref: doc.documentNumber,
        who: doc.client.name.trim() || null,
        what: doc.title.trim() || doc.artwork.description.trim() || 'No title on the commission',
        currency: doc.quote.currency,
        total: totals.total,
        paid: totals.paid,
        due: totals.balance,
        // A commission carries terms, not a due date. Saying null here is the
        // honest answer; it is not "due today".
        dueDate: null,
        since: issuedAt.slice(0, 10),
        notYetSent: false,
      },
    ];
  });
}

/** Everything outstanding, oldest first — what has been waiting longest. */
export function allOwed(input: {
  invoices: Invoice[];
  documents: CommissionDocument[];
}): OwedRow[] {
  return [...owedFromInvoices(input.invoices), ...owedFromCommissions(input.documents, input.invoices)]
    .sort((a, b) => a.since.localeCompare(b.since));
}

/**
 * Past its due date on the given day. A row with no due date is never
 * overdue: nobody agreed a date, so nobody has missed one. A draft invoice is
 * never overdue either — it has not been sent.
 */
export function isOverdue(row: OwedRow, today: string): boolean {
  if (row.notYetSent || row.dueDate === null) return false;
  return row.dueDate < today;
}

/** Whole days a row has been waiting since it was issued. Never negative. */
export function daysWaiting(row: OwedRow, today: string): number {
  const from = Date.parse(`${row.since}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export interface OwedTotal {
  currency: string;
  /** Money actually asked for: drafts are not in here. */
  due: Minor;
  rows: number;
  /** Rows left out of `due` because the invoice is still a draft. */
  notYetSent: number;
  notYetSentDue: Minor;
}

/**
 * One total per currency, because nothing in this app knows an exchange rate
 * and a single figure across two currencies would be a made-up number.
 */
export function owedTotals(rows: OwedRow[]): OwedTotal[] {
  const byCurrency = new Map<string, OwedTotal>();
  for (const row of rows) {
    const current = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      due: 0,
      rows: 0,
      notYetSent: 0,
      notYetSentDue: 0,
    };
    current.rows += 1;
    if (row.notYetSent) {
      current.notYetSent += 1;
      current.notYetSentDue += row.due;
    } else {
      current.due += row.due;
    }
    byCurrency.set(row.currency, current);
  }
  return [...byCurrency.values()].sort((a, b) => b.due - a.due);
}
