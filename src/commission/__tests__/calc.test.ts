import { describe, expect, it } from 'vitest';
import { calculateTotals, parseMoney, validateQuote } from '../calc';
import type { DepositTerms, Payment, Quote } from '../types';

const quote = (over: Partial<Quote> = {}): Quote => ({
  currency: 'USD',
  taxRatePct: null,
  lineItems: [
    { id: 'a', kind: 'artwork', description: 'Oil on panel', quantity: 1, unitPrice: 250000 },
    { id: 'b', kind: 'delivery', description: 'Crating', quantity: 2, unitPrice: 12500 },
  ],
  ...over,
});

const noDeposit: DepositTerms = { kind: 'percent', value: null };

describe('calculateTotals', () => {
  it('sums line items into a subtotal', () => {
    expect(calculateTotals(quote(), [], noDeposit).subtotal).toBe(275000);
  });

  it('leaves tax null when no rate is configured, rather than claiming zero', () => {
    const totals = calculateTotals(quote(), [], noDeposit);
    expect(totals.tax).toBeNull();
    expect(totals.total).toBe(275000);
  });

  it('treats a typed rate of zero as a real zero', () => {
    expect(calculateTotals(quote({ taxRatePct: 0 }), [], noDeposit).tax).toBe(0);
  });

  it('rounds tax once, half-up, on the minor unit', () => {
    // 275000 * 8.25% = 22687.5 cents -> 22688
    expect(calculateTotals(quote({ taxRatePct: 8.25 }), [], noDeposit).tax).toBe(22688);
  });

  it('computes a percentage deposit from the taxed total', () => {
    const totals = calculateTotals(quote({ taxRatePct: 8.25 }), [], { kind: 'percent', value: 50 });
    expect(totals.total).toBe(297688);
    expect(totals.depositRequired).toBe(148844);
  });

  it('uses a fixed deposit amount verbatim', () => {
    expect(calculateTotals(quote(), [], { kind: 'amount', value: 100000 }).depositRequired).toBe(100000);
  });

  it('keeps deposit requested separate from money received', () => {
    const totals = calculateTotals(quote(), [], { kind: 'percent', value: 50 });
    expect(totals.depositRequired).toBe(137500);
    expect(totals.paid).toBe(0);
  });

  it('tracks a partial payment against the balance', () => {
    const payments: Payment[] = [{ id: 'p1', date: '2026-01-05', amount: 137500, note: 'Deposit' }];
    const totals = calculateTotals(quote(), payments, { kind: 'percent', value: 50 });
    expect(totals.paid).toBe(137500);
    expect(totals.balance).toBe(137500);
    expect(totals.credit).toBeNull();
  });

  it('reports overpayment as an explicit credit', () => {
    const payments: Payment[] = [{ id: 'p1', date: '2026-01-05', amount: 300000, note: null }];
    const totals = calculateTotals(quote(), payments, noDeposit);
    expect(totals.balance).toBe(-25000);
    expect(totals.credit).toBe(25000);
  });
});

describe('validateQuote', () => {
  it('accepts a sound quote', () => {
    expect(validateQuote(quote({ taxRatePct: 8.25 }), [], { kind: 'percent', value: 50 })).toEqual([]);
  });

  it('rejects a negative quantity', () => {
    const bad = quote({ lineItems: [{ id: 'a', kind: 'artwork', description: '', quantity: -1, unitPrice: 100 }] });
    expect(validateQuote(bad, [], noDeposit)).toContainEqual(
      expect.objectContaining({ path: 'lineItems[0].quantity' }),
    );
  });

  it('rejects a tax rate above 100', () => {
    expect(validateQuote(quote({ taxRatePct: 150 }), [], noDeposit)).toContainEqual(
      expect.objectContaining({ path: 'taxRatePct' }),
    );
  });

  it('rejects a zero or negative payment', () => {
    const payments: Payment[] = [{ id: 'p', date: '2026-01-01', amount: 0, note: null }];
    expect(validateQuote(quote(), payments, noDeposit)).toContainEqual(
      expect.objectContaining({ path: 'payments[0].amount' }),
    );
  });

  it('rejects a deposit percentage above 100', () => {
    expect(validateQuote(quote(), [], { kind: 'percent', value: 120 })).toContainEqual(
      expect.objectContaining({ path: 'deposit.value' }),
    );
  });
});

describe('parseMoney', () => {
  it('parses a typed amount into minor units', () => {
    expect(parseMoney('1,234.50')).toBe(123450);
    expect(parseMoney('$99')).toBe(9900);
  });

  it('returns null for an empty or unusable entry rather than zero', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});
