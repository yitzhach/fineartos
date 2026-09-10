/**
 * The one place money is calculated. Every total shown anywhere in the app —
 * editor, list, client preview, print — comes from `calculateTotals`.
 *
 * Rounding happens exactly once per derived figure, half-up on the minor unit.
 * Invalid input is reported, never silently coerced to zero.
 */

import type { DepositTerms, LineItem, Minor, Payment, Quote } from './types';

export interface Totals {
  subtotal: Minor;
  /** Null when no tax rate is configured — not zero, which would be a claim. */
  tax: Minor | null;
  total: Minor;
  /** Null when no deposit is configured. This is requested, not received. */
  depositRequired: Minor | null;
  paid: Minor;
  /** total - paid. Negative means the client has overpaid. */
  balance: Minor;
  /** Amount overpaid, as a positive number, or null when not overpaid. */
  credit: Minor | null;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function lineTotal(item: LineItem): Minor {
  return roundHalfUp(item.quantity * item.unitPrice);
}

/**
 * Collects everything wrong with the numbers. An empty array means the
 * document's arithmetic can be trusted.
 */
export function validateQuote(quote: Quote, payments: Payment[], deposit: DepositTerms): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  quote.lineItems.forEach((item, index) => {
    if (!Number.isFinite(item.quantity) || item.quantity < 0) {
      issues.push({ path: `lineItems[${index}].quantity`, message: 'Quantity must be zero or more.' });
    }
    if (!Number.isInteger(item.unitPrice)) {
      issues.push({ path: `lineItems[${index}].unitPrice`, message: 'Unit price must be a whole number of cents.' });
    }
    if (item.unitPrice < 0) {
      issues.push({ path: `lineItems[${index}].unitPrice`, message: 'Unit price cannot be negative.' });
    }
  });

  if (quote.taxRatePct !== null) {
    if (!Number.isFinite(quote.taxRatePct) || quote.taxRatePct < 0 || quote.taxRatePct > 100) {
      issues.push({ path: 'taxRatePct', message: 'Tax rate must be between 0 and 100.' });
    }
  }

  if (deposit.value !== null) {
    if (!Number.isFinite(deposit.value) || deposit.value < 0) {
      issues.push({ path: 'deposit.value', message: 'Deposit cannot be negative.' });
    }
    if (deposit.kind === 'percent' && deposit.value > 100) {
      issues.push({ path: 'deposit.value', message: 'Deposit percentage cannot exceed 100.' });
    }
    if (deposit.kind === 'amount' && !Number.isInteger(deposit.value)) {
      issues.push({ path: 'deposit.value', message: 'Deposit amount must be a whole number of cents.' });
    }
  }

  payments.forEach((payment, index) => {
    if (!Number.isInteger(payment.amount)) {
      issues.push({ path: `payments[${index}].amount`, message: 'Payment must be a whole number of cents.' });
    }
    if (payment.amount <= 0) {
      issues.push({ path: `payments[${index}].amount`, message: 'Payment must be greater than zero.' });
    }
  });

  return issues;
}

export function calculateTotals(quote: Quote, payments: Payment[], deposit: DepositTerms): Totals {
  const subtotal = quote.lineItems.reduce((sum, item) => sum + lineTotal(item), 0);

  // No configured rate means we do not know the tax, which is not the same as
  // knowing it is zero. A rate of 0 that the artist typed does mean zero.
  const tax = quote.taxRatePct === null ? null : roundHalfUp((subtotal * quote.taxRatePct) / 100);

  const total = subtotal + (tax ?? 0);

  let depositRequired: Minor | null = null;
  if (deposit.value !== null) {
    depositRequired =
      deposit.kind === 'percent' ? roundHalfUp((total * deposit.value) / 100) : roundHalfUp(deposit.value);
  }

  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = total - paid;

  return {
    subtotal,
    tax,
    total,
    depositRequired,
    paid,
    balance,
    credit: balance < 0 ? -balance : null,
  };
}

/** Formats minor units for display. Never invents a figure for null. */
export function formatMoney(amount: Minor | null, currency: string): string {
  if (amount === null) return 'Not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}

/** Parses a typed amount like "1,234.50" into minor units, or null if unusable. */
export function parseMoney(input: string): Minor | null {
  const cleaned = input.replace(/[,\s$]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return roundHalfUp(value * 100);
}
