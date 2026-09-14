/**
 * The profit and loss statement: one page to hand an accountant.
 *
 * Rendered from the records as a self-contained HTML file — the studio's own
 * letterhead, the period, what came in, what went out by category, and what
 * is left. It prints to PDF from any browser and needs nothing from this app
 * once it is saved.
 *
 * What it will not do is round a gap away. Every figure that is missing is
 * stated as missing, at the line it belongs to and again at the bottom,
 * because a statement that looks complete and is not is worse than one that
 * says where to look. And it never says "deductible" — categorising a row is
 * bookkeeping, and what it means for a tax return is the accountant's to say.
 */

import { escapeHtml, formatDate } from '../invoice/render';
import {
  byCategory,
  describeCategory,
  incomeIn,
  keptOf,
  milesIn,
  tally,
  type Expense,
  type IncomeRow,
} from './ledger';

export interface StatementContext {
  studioName: string | null;
  studioEmail: string | null;
  studioAddress: string | null;
  logoDataUrl: string | null;
  currency: string;
  /** What the statement covers, in words: "2026", "1 Jan – 30 Jun 2026". */
  period: string;
  /** The day it was drawn up, yyyy-mm-dd. */
  preparedOn: string;
}

export function statementFileStem(context: StatementContext): string {
  return ['profit-and-loss', context.period, context.studioName ?? '']
    .join(' ')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

export function renderStatement(
  income: IncomeRow[],
  expenses: Expense[],
  context: StatementContext,
): string {
  const money = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: context.currency }).format(
      amount / 100,
    );

  const rows = incomeIn(income);
  const invoiced = rows.filter((row) => row.source === 'invoice');
  const pieces = rows.filter((row) => row.source === 'piece');
  const invoicedTally = tally(invoiced.map(keptOf));
  const piecesTally = tally(pieces.map(keptOf));
  const inTally = tally(rows.map(keptOf));
  const lines = byCategory(expenses);
  const outTally = tally(expenses.map((one) => one.amount));
  const net = inTally.total - outTally.total;
  const miles = milesIn(expenses);
  const missing = inTally.missing + outTally.missing;

  const line = (label: string, amount: number, extra?: string) =>
    `<tr><th scope="row">${escapeHtml(label)}${
      extra ? `<span class="sub">${escapeHtml(extra)}</span>` : ''
    }</th><td>${escapeHtml(money(amount))}</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Profit and loss — ${escapeHtml(context.period)}</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 40px 24px 60px;
    background: #fff;
    color: #241f19;
    font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 700px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .logo { max-width: 160px; max-height: 80px; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 26px; margin: 0 0 2px; }
  .who { font-size: 12.5px; color: #6b6459; white-space: pre-line; }
  h2 {
    font-size: 11px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #6b6459;
    margin: 30px 0 6px;
    font-weight: 600;
  }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 400; padding: 6px 0; }
  td { text-align: right; padding: 6px 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr { border-bottom: 1px solid #ece7dc; }
  .sub { display: block; font-size: 11.5px; color: #6b6459; }
  .total th, .total td { font-weight: 700; border-top: 2px solid #241f19; padding-top: 10px; }
  .net { font-family: Georgia, "Times New Roman", serif; font-size: 20px; }
  .gaps { margin-top: 26px; padding: 12px 14px; background: #f6f1e6; border-radius: 8px; font-size: 12.5px; }
  footer { margin-top: 26px; font-size: 11.5px; color: #6b6459; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Profit and loss</h1>
      <div class="who">${escapeHtml(context.period)}</div>
    </div>
    <div style="text-align:right">
      ${context.logoDataUrl ? `<img class="logo" src="${escapeHtml(context.logoDataUrl)}" alt="" />` : ''}
      <div class="who">${escapeHtml(
        [context.studioName, context.studioAddress, context.studioEmail].filter(Boolean).join('\n'),
      )}</div>
    </div>
  </header>

  <h2>Money in</h2>
  <table>
    ${line('Payments received against invoices', invoicedTally.total, `${invoicedTally.counted} ${invoicedTally.counted === 1 ? 'payment' : 'payments'}`)}
    ${line('Sales recorded on pieces', piecesTally.total, `${piecesTally.counted} ${piecesTally.counted === 1 ? 'sale' : 'sales'}`)}
    <tr class="total"><th scope="row">Money in</th><td>${escapeHtml(money(inTally.total))}</td></tr>
  </table>

  <h2>Money out</h2>
  <table>
    ${
      lines.length === 0
        ? '<tr><th scope="row">Nothing recorded</th><td>—</td></tr>'
        : lines
            .map((one) =>
              line(
                describeCategory(one.category),
                one.tally.total,
                [
                  `${one.tally.counted} ${one.tally.counted === 1 ? 'row' : 'rows'}`,
                  one.miles !== null ? `${one.miles} miles` : null,
                  one.tally.missing ? `${one.tally.missing} with no figure` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              ),
            )
            .join('\n    ')
    }
    <tr class="total"><th scope="row">Money out</th><td>${escapeHtml(money(outTally.total))}</td></tr>
  </table>

  <h2>What is left</h2>
  <table>
    <tr class="total"><th scope="row" class="net">Money in less money out</th><td class="net">${escapeHtml(
      money(net),
    )}</td></tr>
  </table>

  <div class="gaps">
    ${
      missing === 0
        ? 'Every row in this period has a figure on it.'
        : `${missing} ${
            missing === 1 ? 'row has' : 'rows have'
          } no figure recorded and are not in these totals. They are listed in the app, and in the CSV, as blanks — not as zero.`
    }
    ${miles > 0 ? `<br />${miles} miles are recorded in the period.` : ''}
  </div>

  <footer>
    Prepared ${escapeHtml(formatDate(context.preparedOn))} from the studio's own records. This is a
    summary for your accountant, not tax advice: which of these belong on a return, and how, is
    theirs to say.
  </footer>
</main>
</body>
</html>`;
}
