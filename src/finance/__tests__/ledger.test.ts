import { describe, expect, it } from 'vitest';
import {
  books,
  byCategory,
  createExpense,
  describeCategory,
  describeTally,
  draftProblem,
  emptyExpenseDraft,
  expenseYears,
  expensesCsv,
  expensesIn,
  incomeCsv,
  keptOf,
  ledgerCsv,
  mileageAmount,
  milesIn,
  tally,
  type Expense,
  type IncomeRow,
} from '../ledger';

const draft = (over = {}) => ({ ...emptyExpenseDraft('2026-03-04'), what: 'Canvas', ...over });
const spend = (over: Partial<Expense> = {}): Expense => ({
  ...createExpense(draft(), { amount: 12000, ratePerMile: null }),
  ...over,
});

describe('a row', () => {
  it('needs a date and a word about what it was', () => {
    expect(draftProblem(emptyExpenseDraft())).toMatch(/what it was/);
    expect(draftProblem(draft())).toBeNull();
    expect(draftProblem(draft({ date: '' }))).toMatch(/date/);
  });

  it('will not take a mileage row with no miles on it', () => {
    expect(draftProblem(draft({ category: 'mileage' }))).toMatch(/miles driven/);
    expect(draftProblem(draft({ category: 'mileage', miles: '120' }))).toBeNull();
  });

  it('keeps an amount nobody recorded as nothing at all, not as zero', () => {
    const row = createExpense(draft(), { amount: null, ratePerMile: null });
    expect(row.amount).toBeNull();
  });
});

describe('mileage', () => {
  it('is the miles times the rate the artist set', () => {
    expect(mileageAmount(120, 67)).toBe(8040);
  });

  it('has no figure at all when no rate has been set', () => {
    // No rate ships with the app: the number changes every year and is not
    // the same in two countries.
    expect(mileageAmount(120, null)).toBeNull();
    const row = createExpense(draft({ category: 'mileage', miles: '120' }), {
      amount: null,
      ratePerMile: null,
    });
    expect(row.miles).toBe(120);
    expect(row.amount).toBeNull();
  });

  it('writes the rate onto the row, so next year\'s rate cannot rewrite it', () => {
    const row = createExpense(draft({ category: 'mileage', miles: '100' }), {
      amount: null,
      ratePerMile: 67,
    });
    expect(row.ratePerMile).toBe(67);
    expect(row.amount).toBe(6700);
  });

  it('adds the miles up whatever the money says', () => {
    expect(milesIn([spend({ miles: 120 }), spend({ miles: 40 }), spend()])).toBe(160);
  });
});

describe('totals', () => {
  it('leaves out what it cannot see, and says how much that was', () => {
    const result = tally([12000, null, 3000, null]);
    expect(result).toEqual({ total: 15000, counted: 2, missing: 2 });
  });

  it('says so in words', () => {
    const format = (amount: number) => `$${(amount / 100).toFixed(2)}`;
    expect(describeTally(tally([12000, 3000]), format)).toBe('$150.00 across 2 rows');
    expect(describeTally(tally([12000, null]), format)).toBe(
      '$120.00 across 1 row — 1 with no figure recorded, so not in it',
    );
  });

  it('groups by category, biggest first, and leaves empty ones out', () => {
    const lines = byCategory([
      spend({ category: 'materials', amount: 5000 }),
      spend({ category: 'lodging', amount: 40000 }),
      spend({ category: 'materials', amount: 7000 }),
    ]);
    expect(lines.map((line) => [line.label, line.tally.total])).toEqual([
      ['Lodging', 40000],
      ['Materials', 12000],
    ]);
    expect(lines.some((line) => line.category === 'framing')).toBe(false);
  });

  it('keeps the years apart', () => {
    const rows = [spend({ date: '2026-03-04' }), spend({ date: '2025-11-01' })];
    expect(expenseYears(rows)).toEqual([2026, 2025]);
    expect(expensesIn(rows, 2025)).toHaveLength(1);
  });
});

describe('money in', () => {
  const income: IncomeRow[] = [
    { id: 'a', source: 'invoice', date: '2026-02-01', what: 'AO-0001', amount: 200000, fee: null, who: 'Ruiz', invoiceId: 'inv-1', photoId: null },
    { id: 'b', source: 'piece', date: '2026-03-04', what: 'Harbour', amount: 120000, fee: 48000, who: null, invoiceId: null, photoId: 'ph-1' },
    { id: 'c', source: 'piece', date: '2026-04-01', what: 'Kiln', amount: null, fee: null, who: null, invoiceId: null, photoId: 'ph-1' },
  ];

  it('knows what was kept after somebody else took their part', () => {
    expect(keptOf(income[1]!)).toBe(72000);
    expect(keptOf(income[0]!)).toBe(200000);
    expect(keptOf(income[2]!)).toBeNull();
  });

  it('nets off against what went out, and admits the gaps', () => {
    const out = [spend({ amount: 12000 }), spend({ amount: null })];
    const result = books(income, out);
    expect(result.inTally.total).toBe(320000);
    expect(result.keptTally.total).toBe(272000);
    expect(result.outTally.total).toBe(12000);
    expect(result.net).toBe(260000);
    // One sale and one expense with no figure on them.
    expect(result.missing).toBe(2);
  });
});

describe('handing it to a bookkeeper', () => {
  const income: IncomeRow[] = [
    { id: 'a', source: 'invoice', date: '2026-02-01', what: 'AO-0001', amount: 200000, fee: null, who: 'Ruiz', invoiceId: 'inv-1', photoId: null },
  ];
  const out = [spend({ date: '2026-03-04', amount: 12000, what: 'Canvas' })];

  it('writes an unrecorded amount as an empty cell, never a nought', () => {
    const csv = expensesCsv([spend({ amount: null, what: 'Gas, receipt lost' })], 'USD');
    expect(csv).toContain('"Gas, receipt lost"');
    expect(csv).not.toContain('"0.00"');
  });

  it('puts both sides on one sheet, with money out written negative', () => {
    const csv = ledgerCsv(income, out, 'USD');
    expect(csv).toContain('"In"');
    expect(csv).toContain('"2000.00"');
    expect(csv).toContain('"Out"');
    expect(csv).toContain('"-120.00"');
  });

  it('keeps a negative figure a number rather than guarding it as text', () => {
    // The apostrophe guard is for text like "=cmd", not for real amounts.
    expect(ledgerCsv([], out, 'USD')).not.toContain(`"'-120.00"`);
  });

  it('will not let a note run as a formula in Excel', () => {
    const csv = expensesCsv([spend({ what: '=cmd|calc' })], 'USD');
    expect(csv).toContain(`"'=cmd|calc"`);
  });

  it('names the source of every pound that came in', () => {
    const csv = incomeCsv(income, 'USD');
    expect(csv).toContain('"Invoice payment"');
    expect(csv).toContain('"Ruiz"');
  });

  it('has a label for every category it offers', () => {
    expect(describeCategory('mileage')).toBe('Mileage');
    expect(describeCategory('other')).toBe('Something else');
  });
});
