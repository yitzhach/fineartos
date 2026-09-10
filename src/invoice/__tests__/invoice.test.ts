import { describe, expect, it } from 'vitest';
import { calculateTotals } from '../../commission/calc';
import { createDocument, recordPayment } from '../../commission/document';
import { emptyPaymentInstructions, type PaymentInstructions } from '../../lib/prefs';
import {
  addDays,
  createBlankInvoice,
  createInvoiceFromDocument,
  invoiceFileStem,
  issueInvoice,
  nextInvoiceNumber,
  recordInvoicePayment,
} from '../invoice';

const instructions = (): PaymentInstructions => ({
  ...emptyPaymentInstructions(),
  venmo: '@ada-studio',
});

function documentWithWork() {
  const doc = createDocument('AO-2026-0001');
  return {
    ...doc,
    title: 'Harbour triptych',
    client: { ...doc.client, name: 'Ada Lovelace', email: 'ada@example.com' },
    quote: {
      currency: 'USD',
      taxRatePct: 8,
      lineItems: [
        { id: 'a', kind: 'artwork' as const, description: 'Triptych', quantity: 1, unitPrice: 400000 },
        { id: 'b', kind: 'delivery' as const, description: 'Crating', quantity: 2, unitPrice: 12500 },
      ],
    },
  };
}

describe('invoice numbering', () => {
  it('starts a fresh series per year', () => {
    expect(nextInvoiceNumber([], 2026)).toBe('INV-2026-0001');
  });

  it('continues from the highest existing number', () => {
    expect(nextInvoiceNumber(['INV-2026-0001', 'INV-2026-0009'], 2026)).toBe('INV-2026-0010');
  });

  it('ignores other years and commission numbers entirely', () => {
    expect(nextInvoiceNumber(['INV-2025-0044', 'AO-2026-0100'], 2026)).toBe('INV-2026-0001');
  });
});

describe('addDays', () => {
  it('adds days across a month boundary in UTC', () => {
    expect(addDays('2026-01-25', 30)).toBe('2026-02-24');
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(addDays('not-a-date', 5)).toBe('not-a-date');
  });
});

describe('createInvoiceFromDocument', () => {
  it('copies the client, studio and every line item by default', () => {
    const invoice = createInvoiceFromDocument(documentWithWork(), 'INV-2026-0001', instructions());
    expect(invoice.client.name).toBe('Ada Lovelace');
    expect(invoice.quote.lineItems).toHaveLength(2);
    expect(invoice.sourceDocumentNumber).toBe('AO-2026-0001');
    expect(invoice.state).toBe('draft');
  });

  it('gives invoice lines their own ids, so editing one cannot touch the commission', () => {
    const doc = documentWithWork();
    const invoice = createInvoiceFromDocument(doc, 'INV-2026-0001', instructions());
    const invoiceIds = invoice.quote.lineItems.map((item) => item.id);
    expect(invoiceIds).not.toContain('a');
    expect(invoiceIds).not.toContain('b');
  });

  it('bills only the chosen lines, which is how a deposit invoice is made', () => {
    const invoice = createInvoiceFromDocument(documentWithWork(), 'INV-2026-0001', instructions(), {
      lineItemIds: ['a'],
    });
    expect(invoice.quote.lineItems).toHaveLength(1);
    expect(invoice.quote.lineItems[0]?.description).toBe('Triptych');
  });

  it('carries recorded payments so the balance due is right', () => {
    const doc = recordPayment(documentWithWork(), { date: '2026-02-01', amount: 100000, note: 'Deposit' });
    const invoice = createInvoiceFromDocument(doc, 'INV-2026-0001', instructions());
    expect(invoice.payments).toHaveLength(1);
    expect(invoice.payments[0]?.amount).toBe(100000);
  });

  it('can leave payments behind when the invoice is for new work', () => {
    const doc = recordPayment(documentWithWork(), { date: '2026-02-01', amount: 100000, note: 'Deposit' });
    const invoice = createInvoiceFromDocument(doc, 'INV-2026-0001', instructions(), {
      carryPayments: false,
    });
    expect(invoice.payments).toHaveLength(0);
  });

  it('leaves the due date null unless payment terms were asked for', () => {
    const invoice = createInvoiceFromDocument(documentWithWork(), 'INV-2026-0001', instructions());
    expect(invoice.dueDate).toBeNull();
  });

  it('computes a due date from net days when they are given', () => {
    const invoice = createInvoiceFromDocument(
      documentWithWork(),
      'INV-2026-0001',
      instructions(),
      { netDays: 30 },
      new Date('2026-03-01T12:00:00Z'),
    );
    expect(invoice.issueDate).toBe('2026-03-01');
    expect(invoice.dueDate).toBe('2026-03-31');
  });

  it('freezes the payment details, so changing them later cannot rewrite a sent invoice', () => {
    const live = instructions();
    const invoice = createInvoiceFromDocument(documentWithWork(), 'INV-2026-0001', live);
    live.venmo = '@moved-house';
    expect(invoice.paymentInstructions.venmo).toBe('@ada-studio');
  });

  it('does not copy private notes onto the invoice', () => {
    const doc = { ...documentWithWork(), privateNotes: 'Client haggles. Hold firm.' };
    const invoice = createInvoiceFromDocument(doc, 'INV-2026-0001', instructions());
    expect(JSON.stringify(invoice)).not.toContain('haggles');
  });
});

describe('invoice totals come from the shared calculation', () => {
  it('matches the commission when every line is billed', () => {
    const doc = documentWithWork();
    const invoice = createInvoiceFromDocument(doc, 'INV-2026-0001', instructions());
    const docTotals = calculateTotals(doc.quote, doc.payments, doc.deposit);
    const invoiceTotals = calculateTotals(invoice.quote, invoice.payments, {
      kind: 'percent',
      value: null,
    });
    expect(invoiceTotals.total).toBe(docTotals.total);
  });

  it('reports tax as not applied rather than zero when no rate is set', () => {
    const doc = documentWithWork();
    const invoice = createInvoiceFromDocument(
      { ...doc, quote: { ...doc.quote, taxRatePct: null } },
      'INV-2026-0001',
      instructions(),
    );
    const totals = calculateTotals(invoice.quote, invoice.payments, { kind: 'percent', value: null });
    expect(totals.tax).toBeNull();
  });

  it('never reports a deposit requirement, which is not an invoice concept', () => {
    const invoice = createInvoiceFromDocument(documentWithWork(), 'INV-2026-0001', instructions());
    const totals = calculateTotals(invoice.quote, invoice.payments, { kind: 'percent', value: null });
    expect(totals.depositRequired).toBeNull();
  });
});

describe('invoice lifecycle', () => {
  it('records the moment it was issued', () => {
    const invoice = issueInvoice(createBlankInvoice('INV-2026-0002', instructions()));
    expect(invoice.state).toBe('issued');
    expect(invoice.issuedAt).not.toBeNull();
  });

  it('adds a payment without disturbing the ones already there', () => {
    let invoice = createBlankInvoice('INV-2026-0002', instructions());
    invoice = recordInvoicePayment(invoice, { date: '2026-04-01', amount: 5000, note: null });
    invoice = recordInvoicePayment(invoice, { date: '2026-04-08', amount: 2500, note: 'Balance' });
    expect(invoice.payments.map((p) => p.amount)).toEqual([5000, 2500]);
  });
});

describe('invoiceFileStem', () => {
  it('joins the number and the client name safely', () => {
    const invoice = { ...createBlankInvoice('INV-2026-0004', instructions()) };
    invoice.client = { ...invoice.client, name: 'Ada Lovelace' };
    expect(invoiceFileStem(invoice)).toBe('INV-2026-0004-Ada-Lovelace');
  });

  it('falls back to the number alone when there is no client name', () => {
    expect(invoiceFileStem(createBlankInvoice('INV-2026-0004', instructions()))).toBe('INV-2026-0004');
  });

  it('strips characters a filesystem would refuse', () => {
    const invoice = { ...createBlankInvoice('INV-2026-0005', instructions()) };
    invoice.client = { ...invoice.client, name: 'Smith / Jones & Co.' };
    expect(invoiceFileStem(invoice)).toBe('INV-2026-0005-Smith-Jones-Co');
  });
});
