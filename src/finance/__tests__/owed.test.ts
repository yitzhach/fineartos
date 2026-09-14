import { describe, expect, it } from 'vitest';
import type { CommissionDocument } from '../../commission/types';
import type { Invoice } from '../../invoice/types';
import {
  allOwed,
  daysWaiting,
  isOverdue,
  owedFromCommissions,
  owedFromInvoices,
  owedTotals,
} from '../owed';

const invoice = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: 'inv-1',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-02-01',
    issuedAt: '2026-02-01T10:00:00.000Z',
    dueDate: null,
    state: 'issued',
    sourceDocumentId: null,
    client: { name: 'Ruiz Collection' },
    quote: {
      currency: 'USD',
      taxRatePct: null,
      lineItems: [{ id: 'l1', kind: 'artwork', description: 'Harbour triptych', quantity: 1, unitPrice: 200000 }],
    },
    payments: [],
    ...over,
  }) as Invoice;

const commission = (over: Partial<CommissionDocument> = {}): CommissionDocument =>
  ({
    id: 'doc-1',
    documentNumber: 'AO-2026-0007',
    title: 'Kiln study',
    state: 'issued',
    client: { name: 'Vance' },
    artwork: { description: 'Oil on linen' },
    quote: {
      currency: 'USD',
      taxRatePct: null,
      lineItems: [{ id: 'l1', kind: 'artwork', description: 'Kiln study', quantity: 1, unitPrice: 150000 }],
    },
    deposit: { kind: 'percent', value: null },
    payments: [],
    issuedSnapshots: [{ version: 1, issuedAt: '2026-01-05T09:00:00.000Z', document: {} as never }],
    updatedAt: '2026-01-06T09:00:00.000Z',
    ...over,
  }) as CommissionDocument;

describe('what is still owed', () => {
  it('lists an invoice with a balance, and drops one paid off', () => {
    const rows = owedFromInvoices([
      invoice(),
      invoice({ id: 'inv-2', payments: [{ id: 'p1', date: '2026-02-10', amount: 200000, note: null }] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recordId: 'inv-1', due: 200000, paid: 0, source: 'invoice' });
  });

  it('shows what is left when part of it has been paid', () => {
    const rows = owedFromInvoices([
      invoice({ payments: [{ id: 'p1', date: '2026-02-10', amount: 50000, note: null }] }),
    ]);
    expect(rows[0]).toMatchObject({ total: 200000, paid: 50000, due: 150000 });
  });

  it('marks a draft invoice as not yet sent, so nobody is late paying it', () => {
    const rows = owedFromInvoices([invoice({ state: 'draft', issuedAt: null, dueDate: '2026-01-01' })]);
    expect(rows[0]!.notYetSent).toBe(true);
    expect(isOverdue(rows[0]!, '2026-06-01')).toBe(false);
  });

  it('is overdue only when a due date was actually set and has passed', () => {
    const [withDate] = owedFromInvoices([invoice({ dueDate: '2026-03-01' })]);
    const [without] = owedFromInvoices([invoice()]);
    expect(isOverdue(withDate!, '2026-03-02')).toBe(true);
    expect(isOverdue(withDate!, '2026-02-28')).toBe(false);
    expect(without!.dueDate).toBeNull();
    expect(isOverdue(without!, '2030-01-01')).toBe(false);
  });

  it('lists a lingering commission that was never invoiced', () => {
    const rows = owedFromCommissions([commission()], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'commission', recordId: 'doc-1', due: 150000 });
    // A commission carries terms, not a due date: null, never "due today".
    expect(rows[0]!.dueDate).toBeNull();
  });

  it('leaves out a commission once an invoice has been raised against it', () => {
    const rows = owedFromCommissions([commission()], [invoice({ sourceDocumentId: 'doc-1' })]);
    expect(rows).toHaveLength(0);
  });

  it('leaves out a draft commission — nothing has been agreed to pay', () => {
    expect(owedFromCommissions([commission({ state: 'draft' })], [])).toHaveLength(0);
  });

  it('counts the days since it was issued', () => {
    const rows = owedFromCommissions([commission()], []);
    expect(daysWaiting(rows[0]!, '2026-01-15')).toBe(10);
    expect(daysWaiting(rows[0]!, '2025-12-01')).toBe(0);
  });

  it('puts the longest wait first', () => {
    const rows = allOwed({ invoices: [invoice()], documents: [commission()] });
    expect(rows.map((row) => row.ref)).toEqual(['AO-2026-0007', 'INV-2026-0001']);
  });

  it('totals one currency at a time, because nothing here knows a rate', () => {
    const totals = owedTotals(
      owedFromInvoices([
        invoice(),
        invoice({
          id: 'inv-2',
          quote: {
            currency: 'GBP',
            taxRatePct: null,
            lineItems: [{ id: 'l1', kind: 'artwork', description: 'Study', quantity: 1, unitPrice: 40000 }],
          },
        }),
      ]),
    );
    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({ currency: 'USD', due: 200000, rows: 1 });
    expect(totals[1]).toMatchObject({ currency: 'GBP', due: 40000, rows: 1 });
  });

  it('keeps a draft out of the total and says so', () => {
    const totals = owedTotals(owedFromInvoices([invoice(), invoice({ id: 'inv-2', state: 'draft' })]));
    expect(totals[0]).toMatchObject({ due: 200000, notYetSent: 1, notYetSentDue: 200000, rows: 2 });
  });
});
