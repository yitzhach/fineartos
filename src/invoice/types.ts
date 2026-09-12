/**
 * Invoice model.
 *
 * An invoice is a child record of a commission, never a mode of one. It is
 * generated from the commission and then stands on its own: editing the
 * commission afterwards does not reach back into an invoice you already gave
 * a client. A commission can have any number of invoices — a deposit invoice
 * and a final invoice against the same project are the normal case.
 *
 * It reuses `Quote` and `Payment` from the commission model on purpose, so
 * `calculateTotals` remains the single place money is worked out. Money is
 * integer minor units here as everywhere else.
 */

import type { Client, Payment, Quote, StudioProfile } from '../commission/types';
import type { PaymentInstructions } from '../lib/prefs';

export type InvoiceState = 'draft' | 'issued';

export interface Invoice {
  id: string;
  /** The project folder this invoice was filed into, if any. */
  projectId: string | null;
  /** The commission it was generated from. Kept for provenance, not for sync. */
  sourceDocumentId: string | null;
  sourceDocumentNumber: string | null;

  invoiceNumber: string;
  /** yyyy-mm-dd. */
  issueDate: string;
  /** Null means no due date was set — not "due today". */
  dueDate: string | null;

  studio: StudioProfile;
  client: Client;
  quote: Quote;
  /** Money actually received against this invoice. */
  payments: Payment[];

  /**
   * A frozen copy of how to pay, taken when the invoice was created. If the
   * artist later changes their Venmo handle, an invoice already sent still
   * shows what the client was actually told.
   */
  paymentInstructions: PaymentInstructions;

  /** Free text shown to the client above the payment block. */
  note: string | null;

  /**
   * Pictures shown on the invoice — the work itself, a detail, a photo of it
   * hung. Optional in the type because invoices written before this existed
   * have no such field; the repository fills it in on read.
   */
  imageIds?: string[];

  state: InvoiceState;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
