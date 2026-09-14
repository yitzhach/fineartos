/**
 * The books: what came in, what went out, and what is left.
 *
 * This is a bookkeeping tool for one artist, written to be handed to an
 * accountant — not tax software. Two rules follow from that and run through
 * everything here:
 *
 *  - **Nothing here is tax advice.** Categorising a row is bookkeeping. The
 *    word "deductible" does not appear in this app, because whether something
 *    is deductible depends on where the artist lives, what else they earn and
 *    what their accountant says.
 *  - **A total says what it could not see.** An expense with no amount
 *    recorded is null, never zero, and it is left out of the total *and*
 *    counted, so the figure is never quietly short. A number that is wrong on
 *    a tax return is worse than a number that is missing.
 *
 * Money is integer minor units, as everywhere else in the app.
 *
 * DOM-free, like the rest of the model layer.
 */

import { newId } from '../commission/document';

/** Integer minor units, as the rest of the app keeps money. */
type Minor = number;

export type ExpenseCategory =
  | 'materials'
  | 'framing'
  | 'studio'
  | 'fuel'
  | 'mileage'
  | 'lodging'
  | 'meals'
  | 'fees'
  | 'shipping'
  | 'marketing'
  | 'software'
  | 'professional'
  | 'other';

export const CATEGORIES: { id: ExpenseCategory; label: string; hint?: string }[] = [
  { id: 'materials', label: 'Materials', hint: 'Paint, canvas, clay, wood' },
  { id: 'framing', label: 'Framing' },
  { id: 'studio', label: 'Studio', hint: 'Rent, power, insurance' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'mileage', label: 'Mileage', hint: 'Miles driven, at the rate you set' },
  { id: 'lodging', label: 'Lodging' },
  { id: 'meals', label: 'Meals' },
  { id: 'fees', label: 'Show fees', hint: 'Booth, entry, jury and commission' },
  { id: 'shipping', label: 'Shipping and crating' },
  { id: 'marketing', label: 'Marketing', hint: 'Prints, cards, website, ads' },
  { id: 'software', label: 'Software and tools' },
  { id: 'professional', label: 'Professional', hint: 'Accountant, lawyer, photographer' },
  { id: 'other', label: 'Something else' },
];

export function describeCategory(category: ExpenseCategory): string {
  return CATEGORIES.find((one) => one.id === category)?.label ?? 'Something else';
}

export interface Expense {
  id: string;
  /** yyyy-mm-dd. The one thing every row has. */
  date: string;
  category: ExpenseCategory;
  /** What it was. Free text, in the artist's own words. */
  what: string;
  /** What it cost, in minor units. Null = not recorded, and never zero. */
  amount: Minor | null;
  /** Miles driven, for a mileage row. Null on every other kind. */
  miles: number | null;
  /**
   * The rate used, in minor units per mile, copied onto the row when it was
   * written. Kept here rather than read live so that changing the rate next
   * year does not silently rewrite last year's books.
   */
  ratePerMile: Minor | null;
  /** Photographs of the receipt, in the image store. */
  receiptImageIds: string[];
  /** Which show or trip it belongs to, when it belongs to one. */
  jobRef: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseDraft {
  date: string;
  category: ExpenseCategory;
  what: string;
  amount: string;
  miles: string;
  jobRef: string;
  note: string;
  receiptImageIds: string[];
}

export function emptyExpenseDraft(date = today()): ExpenseDraft {
  return {
    date,
    category: 'materials',
    what: '',
    amount: '',
    miles: '',
    jobRef: '',
    note: '',
    receiptImageIds: [],
  };
}

/** Why a row cannot be saved, or null when it can. */
export function draftProblem(draft: ExpenseDraft): string | null {
  if (!draft.date.trim()) return 'A row needs a date.';
  if (!draft.what.trim()) return 'Say what it was, even roughly — “canvas”, “gas to Santa Fe”.';
  if (draft.category === 'mileage' && draft.miles.trim() === '') {
    return 'A mileage row needs the miles driven.';
  }
  return null;
}

/**
 * What a mileage row is worth: the miles times the rate the artist set.
 * No rate ships with this app — the IRS number changes every year and is not
 * the same anywhere else — so with no rate there is no figure, and the row
 * says so rather than inventing one.
 */
export function mileageAmount(miles: number | null, ratePerMile: Minor | null): Minor | null {
  if (miles === null || ratePerMile === null) return null;
  return Math.round(miles * ratePerMile);
}

export function createExpense(
  draft: ExpenseDraft,
  options: { amount: Minor | null; ratePerMile: Minor | null },
  now = new Date(),
): Expense {
  const iso = now.toISOString();
  const miles = draft.miles.trim() === '' ? null : Number(draft.miles);
  const isMileage = draft.category === 'mileage';
  return {
    id: newId(),
    date: draft.date,
    category: draft.category,
    what: draft.what.trim(),
    amount: isMileage
      ? mileageAmount(miles, options.ratePerMile)
      : options.amount,
    miles: isMileage && Number.isFinite(miles) ? miles : null,
    ratePerMile: isMileage ? options.ratePerMile : null,
    receiptImageIds: [...draft.receiptImageIds],
    jobRef: draft.jobRef.trim() || null,
    note: draft.note.trim() || null,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function editExpense(expense: Expense, changes: Partial<Expense>, now = new Date()): Expense {
  return { ...expense, ...changes, id: expense.id, updatedAt: now.toISOString() };
}

export function expensesIn(expenses: Expense[], year?: number): Expense[] {
  return expenses
    .filter((one) => (year === undefined ? true : one.date.startsWith(String(year))))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// --- Adding it up -----------------------------------------------------------

export interface Tally {
  /** The sum of the rows that had a figure. */
  total: Minor;
  /** How many rows are in it. */
  counted: number;
  /** How many rows had no figure and so are not. */
  missing: number;
}

export function tally(amounts: (Minor | null)[]): Tally {
  let total = 0;
  let counted = 0;
  let missing = 0;
  for (const amount of amounts) {
    if (amount === null) {
      missing += 1;
      continue;
    }
    total += amount;
    counted += 1;
  }
  return { total, counted, missing };
}

/** "£1,240 across 8 rows — 2 with no figure", said in the caller's currency. */
export function describeTally(
  value: Tally,
  format: (amount: Minor) => string,
): string {
  const rows = `${value.counted} ${value.counted === 1 ? 'row' : 'rows'}`;
  if (value.missing === 0) return `${format(value.total)} across ${rows}`;
  return `${format(value.total)} across ${rows} — ${value.missing} with no figure recorded, so not in it`;
}

export interface CategoryLine {
  category: ExpenseCategory;
  label: string;
  tally: Tally;
  miles: number | null;
}

/** Expenses grouped by category, biggest first, with the empty ones left out. */
export function byCategory(expenses: Expense[]): CategoryLine[] {
  const lines: CategoryLine[] = [];
  for (const { id, label } of CATEGORIES) {
    const rows = expenses.filter((one) => one.category === id);
    if (rows.length === 0) continue;
    const miles = rows.reduce<number | null>(
      (sum, row) => (row.miles === null ? sum : (sum ?? 0) + row.miles),
      null,
    );
    lines.push({ category: id, label, tally: tally(rows.map((row) => row.amount)), miles });
  }
  return lines.sort((a, b) => b.tally.total - a.tally.total);
}

export function milesIn(expenses: Expense[]): number {
  return expenses.reduce((sum, row) => sum + (row.miles ?? 0), 0);
}

export function expenseYears(expenses: Expense[]): number[] {
  const years = new Set<number>();
  for (const one of expenses) years.add(Number(one.date.slice(0, 4)));
  return [...years].filter((year) => Number.isFinite(year)).sort((a, b) => b - a);
}

// --- Money in ---------------------------------------------------------------

/**
 * A row of income, from wherever it came.
 *
 * Two streams reach this: payments actually received against an invoice, and
 * sales written on a piece in the catalogue. They are kept apart on purpose —
 * a piece that was sold *and* invoiced would otherwise be counted twice, and
 * the app cannot tell on its own. A sale marked as invoiced drops out of the
 * catalogue stream, which is the artist saying which it was.
 */
export type IncomeSource = 'invoice' | 'piece';

export interface IncomeRow {
  id: string;
  source: IncomeSource;
  date: string;
  what: string;
  /** Null when the figure was never recorded. Never zero as a stand-in. */
  amount: Minor | null;
  /** What a gallery or show took off it, where that was written down. */
  fee: Minor | null;
  who: string | null;
  /**
   * The invoice this payment landed on, so the row can be opened. Null on a
   * sale written on a piece, which has no invoice behind it.
   */
  invoiceId: string | null;
  /** The piece that was sold, for the same reason. Null on an invoice row. */
  photoId: string | null;
}

export function incomeIn(rows: IncomeRow[], year?: number): IncomeRow[] {
  return rows
    .filter((row) => (year === undefined ? true : row.date.startsWith(String(year))))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** What was kept: the amount less the part somebody else took. */
export function keptOf(row: IncomeRow): Minor | null {
  if (row.amount === null) return null;
  return row.fee === null ? row.amount : row.amount - row.fee;
}

export interface Books {
  inTally: Tally;
  keptTally: Tally;
  outTally: Tally;
  /** Kept less what went out. Only as good as the rows behind it. */
  net: Minor;
  /** Rows on either side with no figure on them. */
  missing: number;
}

export function books(income: IncomeRow[], expenses: Expense[]): Books {
  const inTally = tally(income.map((row) => row.amount));
  const keptTally = tally(income.map(keptOf));
  const outTally = tally(expenses.map((row) => row.amount));
  return {
    inTally,
    keptTally,
    outTally,
    net: keptTally.total - outTally.total,
    missing: inTally.missing + outTally.missing,
  };
}

// --- Handing it over --------------------------------------------------------

export function expensesCsv(expenses: Expense[], currency: string): string {
  const header = [
    'Date',
    'Category',
    'What',
    'Amount',
    'Currency',
    'Miles',
    'Rate per mile',
    'For',
    'Receipts',
    'Note',
  ];
  const rows = expensesIn(expenses).map((one) => [
    one.date,
    describeCategory(one.category),
    one.what,
    money(one.amount),
    currency,
    one.miles === null ? '' : String(one.miles),
    money(one.ratePerMile),
    one.jobRef ?? '',
    one.receiptImageIds.length ? String(one.receiptImageIds.length) : '',
    one.note ?? '',
  ]);
  return toCsv([header, ...rows]);
}

export function incomeCsv(rows: IncomeRow[], currency: string): string {
  const header = ['Date', 'Source', 'What', 'Amount', 'Fee taken', 'Kept', 'Currency', 'Who'];
  const body = incomeIn(rows).map((row) => [
    row.date,
    row.source === 'invoice' ? 'Invoice payment' : 'Sale of a piece',
    row.what,
    money(row.amount),
    money(row.fee),
    money(keptOf(row)),
    currency,
    row.who ?? '',
  ]);
  return toCsv([header, ...body]);
}

/**
 * One sheet with both sides on it, which is what a bookkeeper pastes into a
 * spreadsheet or imports. Money out is written negative, so a column of it
 * adds up to the net on its own.
 */
export function ledgerCsv(income: IncomeRow[], expenses: Expense[], currency: string): string {
  const header = ['Date', 'In or out', 'Category', 'What', 'Amount', 'Currency', 'Who or where'];
  const rows: string[][] = [
    ...incomeIn(income).map((row) => [
      row.date,
      'In',
      row.source === 'invoice' ? 'Invoice payment' : 'Sale of a piece',
      row.what,
      money(keptOf(row)),
      currency,
      row.who ?? '',
    ]),
    ...expensesIn(expenses).map((one) => [
      one.date,
      'Out',
      describeCategory(one.category),
      one.what,
      one.amount === null ? '' : (-one.amount / 100).toFixed(2),
      currency,
      one.jobRef ?? '',
    ]),
  ].sort((a, b) => b[0]!.localeCompare(a[0]!));
  return toCsv([header, ...rows]);
}

/** An empty cell for an amount nobody recorded: a nought would add itself in. */
function money(amount: Minor | null): string {
  return amount === null ? '' : (amount / 100).toFixed(2);
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/**
 * A spreadsheet treats a cell starting with = + - @ as a formula, so a note
 * like "=cmd" would run in Excel. Prefixing an apostrophe keeps the text.
 * Negative amounts are written by `money` above and are numbers, not text, so
 * they are not guarded here — a leading minus on a real figure is the point.
 */
function csvCell(value: string): string {
  const isNumber = /^-?\d+(\.\d+)?$/.test(value);
  const guarded = !isNumber && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
