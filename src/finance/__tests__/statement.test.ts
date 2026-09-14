import { describe, expect, it } from 'vitest';
import { createExpense, emptyExpenseDraft, type Expense, type IncomeRow } from '../ledger';
import { renderStatement, statementFileStem, type StatementContext } from '../statement';

const context: StatementContext = {
  studioName: 'Isaac Anderson Studio',
  studioEmail: 'studio@example.com',
  studioAddress: '42 Kiln Lane, Santa Fe',
  logoDataUrl: null,
  currency: 'USD',
  period: '2026',
  preparedOn: '2026-12-31',
};

const spend = (over: Partial<Expense>): Expense => ({
  ...createExpense({ ...emptyExpenseDraft('2026-03-04'), what: 'Canvas' }, { amount: 12000, ratePerMile: null }),
  ...over,
});

const income: IncomeRow[] = [
  { id: 'a', source: 'invoice', date: '2026-02-01', what: 'AO-0001', amount: 200000, fee: null, who: 'Ruiz', invoiceId: 'inv-1', photoId: null },
  { id: 'b', source: 'piece', date: '2026-03-04', what: 'Harbour', amount: 120000, fee: 48000, who: null, invoiceId: null, photoId: 'ph-1' },
];

describe('the statement', () => {
  it('keeps the two kinds of income apart, because they can be the same money', () => {
    const html = renderStatement(income, [spend({})], context);
    expect(html).toContain('Payments received against invoices');
    expect(html).toContain('Sales recorded on pieces');
    expect(html).toContain('$2,000.00');
    // The piece sold for 1,200 with 480 taken by the gallery.
    expect(html).toContain('$720.00');
  });

  it('nets what is left off what was kept', () => {
    const html = renderStatement(income, [spend({ amount: 12000 })], context);
    expect(html).toContain('Money in less money out');
    expect(html).toContain('$2,600.00');
  });

  it('says how many rows it could not count, at the bottom where it matters', () => {
    const html = renderStatement(
      [...income, { id: 'c', source: 'piece', date: '2026-05-01', what: 'Kiln', amount: null, fee: null, who: null, invoiceId: null, photoId: 'ph-1' }],
      [spend({ amount: null })],
      context,
    );
    expect(html).toMatch(/2 rows have no figure recorded/);
    expect(html).toContain('not as zero');
  });

  it('says when there is nothing missing, rather than staying quiet', () => {
    expect(renderStatement(income, [spend({})], context)).toContain('Every row in this period has a figure');
  });

  it('reports the miles', () => {
    const html = renderStatement(income, [spend({ category: 'mileage', miles: 240, amount: 16080 })], context);
    expect(html).toContain('240 miles');
  });

  it('carries the studio\'s own letterhead', () => {
    const html = renderStatement(income, [], { ...context, logoDataUrl: 'data:image/png;base64,AAA' });
    expect(html).toContain('Isaac Anderson Studio');
    expect(html).toContain('42 Kiln Lane, Santa Fe');
    expect(html).toContain('src="data:image/png;base64,AAA"');
  });

  it('never calls anything deductible, and says whose job that is', () => {
    const html = renderStatement(income, [spend({})], context);
    expect(html.toLowerCase()).not.toContain('deduct');
    expect(html).toMatch(/not tax advice/);
  });

  it('escapes what a person typed', () => {
    const html = renderStatement(income, [], { ...context, studioName: '<script>bad()</script>' });
    expect(html).not.toContain('<script>bad()</script>');
  });

  it('names the file after the period', () => {
    expect(statementFileStem(context)).toBe('profit-and-loss-2026-isaac-anderson-studio');
  });
});
