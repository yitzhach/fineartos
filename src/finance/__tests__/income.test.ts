import { describe, expect, it } from 'vitest';
import { createPhoto, editPhoto, type Photo } from '../../photo/photo';
import type { Invoice } from '../../invoice/types';
import { allIncome, incomeFromInvoices, incomeFromPieces, invoicedPieces } from '../income';

const piece = (title: string, sale: Photo['sale']): Photo =>
  editPhoto(createPhoto({ imageId: `img-${title}`, title, pixelWidth: 10, pixelHeight: 10 }), { sale });

const invoice = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: 'inv-1',
    invoiceNumber: 'AO-2026-0001',
    client: { name: 'Ruiz Collection' },
    payments: [{ id: 'p1', date: '2026-02-01', amount: 200000, note: 'Deposit' }],
    ...over,
  }) as Invoice;

describe('money in', () => {
  it('takes a row for every payment actually received', () => {
    const rows = incomeFromInvoices([invoice()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'invoice', amount: 200000, who: 'Ruiz Collection' });
    expect(rows[0]!.what).toContain('AO-2026-0001');
    expect(rows[0]!.what).toContain('Deposit');
  });

  it('takes a row for every sale written on a piece', () => {
    const rows = incomeFromPieces([
      piece('Harbour', { date: '2026-03-04', amount: 120000, fee: 48000, where: 'Santa Fe', buyer: null, note: null }),
      piece('Untouched', null),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'piece', amount: 120000, fee: 48000, who: 'Santa Fe' });
  });

  it('leaves out a sale the artist marked as already invoiced', () => {
    const photos = [
      piece('Harbour', { date: '2026-03-04', amount: 120000, fee: null, where: null, buyer: null, note: null, invoiced: true }),
      piece('Kiln', { date: '2026-04-01', amount: 90000, fee: null, where: null, buyer: null, note: null }),
    ];
    // Otherwise the invoice payment and the sale would be the same money twice.
    expect(incomeFromPieces(photos).map((row) => row.what)).toEqual(['Kiln']);
    expect(invoicedPieces(photos).map((one) => one.title)).toEqual(['Harbour']);
  });

  it('puts both streams together for the books', () => {
    const rows = allIncome({
      invoices: [invoice()],
      photos: [piece('Kiln', { date: '2026-04-01', amount: 90000, fee: null, where: null, buyer: null, note: null })],
    });
    expect(rows.map((row) => row.source)).toEqual(['invoice', 'piece']);
  });
});
