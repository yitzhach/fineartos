import { useMemo, useRef, useState } from 'react';
import { formatMoney, parseMoney } from '../../commission/calc';
import type { CommissionDocument } from '../../commission/types';
import type { Invoice } from '../../invoice/types';
import type { StudioDefaults } from '../../lib/prefs';
import type { Photo } from '../../photo/photo';
import {
  CATEGORIES,
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
  incomeIn,
  keptOf,
  ledgerCsv,
  mileageAmount,
  milesIn,
  tally,
  type Expense,
  type ExpenseCategory,
  type ExpenseDraft,
} from '../ledger';
import { allIncome, invoicedPieces } from '../income';
import { allOwed, daysWaiting, isOverdue, owedTotals } from '../owed';
import { renderStatement, statementFileStem, type StatementContext } from '../statement';
import { Dictate } from './Dictate';

interface Props {
  photos: Photo[];
  invoices: Invoice[];
  /** Commissions, so what is owed can show one that was never invoiced. */
  documents: CommissionDocument[];
  expenses: Expense[];
  imageUrls: Record<string, string>;
  studio: StudioDefaults;
  /** Minor units per mile, as the artist set it. Null until they do. */
  mileageRate: number | null;
  onMileageRate: (rate: number | null) => void;
  onSaveExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  /** Stores receipt photographs and gives back their image ids. */
  onAddReceipts: (files: File[]) => Promise<string[]>;
  /** Marks a piece's sale as already invoiced, so it is not counted twice. */
  onMarkInvoiced: (photoId: string, invoiced: boolean) => void;
  /** Opens the record a row stands for, in its own window. */
  onOpenInvoice: (id: string) => void;
  onOpenDocument: (id: string) => void;
  /** The books as a file that reads back in — the CSV is one-way. */
  onExportBooks: () => void;
  onImportBooks: (file: File) => void;
  onMessage: (text: string) => void;
}

type View = 'overview' | 'in' | 'owed' | 'out' | 'statement';

/**
 * The books.
 *
 * What came in, what went out, and what is left — for one artist, written to
 * be handed to an accountant. It reads the records that already exist
 * (payments on invoices, sales on pieces) and adds the one thing the studio
 * had nowhere to put: what was spent.
 *
 * Two things it will not do. It will not call anything deductible —
 * categorising a row is bookkeeping, and what it means on a return is the
 * accountant's to say. And it will not quietly drop a row with no figure on
 * it: every total says how many it could not count.
 */
export function FinanceWindow(props: Props) {
  const { expenses, photos, invoices, documents, studio } = props;
  const [view, setView] = useState<View>('overview');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [draft, setDraft] = useState<ExpenseDraft>(emptyExpenseDraft);
  const [busy, setBusy] = useState(false);
  const receiptInput = useRef<HTMLInputElement>(null);

  const currency = invoices[0]?.quote.currency ?? photos[0]?.currency ?? 'USD';
  const money = (amount: number) => formatMoney(amount, currency);

  const income = useMemo(() => allIncome({ invoices, photos }), [invoices, photos]);
  const years = useMemo(() => {
    const all = new Set<number>([
      ...expenseYears(expenses),
      ...income.map((row) => Number(row.date.slice(0, 4))),
      new Date().getFullYear(),
    ]);
    return [...all].filter((one) => Number.isFinite(one)).sort((a, b) => b - a);
  }, [expenses, income]);

  const yearIncome = useMemo(() => incomeIn(income, year), [income, year]);
  const yearSpend = useMemo(() => expensesIn(expenses, year), [expenses, year]);
  const figures = useMemo(() => books(yearIncome, yearSpend), [yearIncome, yearSpend]);
  const lines = useMemo(() => byCategory(yearSpend), [yearSpend]);
  const alsoInvoiced = useMemo(() => invoicedPieces(photos), [photos]);

  // What is still owed is not filtered by year: money from two years ago that
  // never arrived is exactly what this list is for.
  const today = new Date().toISOString().slice(0, 10);
  const owed = useMemo(() => allOwed({ invoices, documents }), [invoices, documents]);
  const owedByCurrency = useMemo(() => owedTotals(owed), [owed]);

  const problem = draftProblem(draft);
  const isMileage = draft.category === 'mileage';
  const milesTyped = draft.miles.trim() === '' ? null : Number(draft.miles);
  const mileagePreview = mileageAmount(milesTyped, props.mileageRate);

  const saveDraft = () => {
    if (problem) return;
    props.onSaveExpense(
      createExpense(draft, { amount: parseMoney(draft.amount), ratePerMile: props.mileageRate }),
    );
    setDraft({ ...emptyExpenseDraft(draft.date), category: draft.category, jobRef: draft.jobRef });
    props.onMessage('Written down.');
  };

  const statementContext = (): StatementContext => ({
    studioName: studio.name || null,
    studioEmail: studio.email || null,
    studioAddress: studio.address || null,
    logoDataUrl: null,
    currency,
    period: String(year),
    preparedOn: new Date().toISOString().slice(0, 10),
  });

  return (
    <div className="fin">
      <div className="fin-bar">
        <div className="chip-row">
          {(['overview', 'in', 'owed', 'out', 'statement'] as View[]).map((one) => (
            <button
              key={one}
              className="btn"
              data-variant={view === one ? 'primary' : 'quiet'}
              aria-pressed={view === one}
              onClick={() => setView(one)}
            >
              {one === 'overview'
                ? 'Overview'
                : one === 'in'
                  ? 'Money in'
                  : one === 'owed'
                    ? `Payment due${owed.length ? ` (${owed.length})` : ''}`
                    : one === 'out'
                      ? 'Money out'
                      : 'Statement'}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {years.slice(0, 5).map((one) => (
            <button
              key={one}
              className="btn"
              data-variant={year === one ? 'primary' : 'quiet'}
              onClick={() => setYear(one)}
            >
              {one}
            </button>
          ))}
        </div>
      </div>

      {view === 'overview' && (
        <div className="fin-overview">
          <div className="fin-figures">
            <div>
              <span className="k">Money in</span>
              <strong>{money(figures.keptTally.total)}</strong>
              <span className="hint">after what galleries took, where that was written down</span>
            </div>
            <div>
              <span className="k">Money out</span>
              <strong>{money(figures.outTally.total)}</strong>
              <span className="hint">{describeTally(figures.outTally, money)}</span>
            </div>
            <div>
              <span className="k">What is left</span>
              <strong data-negative={figures.net < 0}>{money(figures.net)}</strong>
              <span className="hint">{year}, on the rows below</span>
            </div>
          </div>

          <p className="notice">
            {figures.missing === 0
              ? 'Every row in this year has a figure on it.'
              : `${figures.missing} ${
                  figures.missing === 1 ? 'row has' : 'rows have'
                } no figure recorded and are not in these totals — they are blanks, not zeroes.`}{' '}
            These are your own records for your accountant, not tax advice: which of them belong
            on a return, and how, is theirs to say.
          </p>

          {lines.length > 0 && (
            <div className="fin-cats">
              <h4>Where it went</h4>
              {lines.map((line) => {
                const share =
                  figures.outTally.total > 0
                    ? Math.round((line.tally.total / figures.outTally.total) * 100)
                    : 0;
                return (
                  <div key={line.category} className="fin-cat">
                    <span className="fin-cat-name">{line.label}</span>
                    <span className="fin-cat-bar" aria-hidden="true">
                      <span style={{ width: `${share}%` }} />
                    </span>
                    <span className="fin-cat-money">{money(line.tally.total)}</span>
                    <span className="fin-cat-note">
                      {line.tally.counted} {line.tally.counted === 1 ? 'row' : 'rows'}
                      {line.miles !== null ? ` · ${line.miles} miles` : ''}
                      {line.tally.missing ? ` · ${line.tally.missing} with no figure` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {milesIn(yearSpend) > 0 && (
            <p className="hint">
              {milesIn(yearSpend)} miles recorded in {year}
              {props.mileageRate === null
                ? ' — no rate set, so none of them have a figure. Set one under Money out.'
                : ` at ${money(props.mileageRate)} a mile.`}
            </p>
          )}
        </div>
      )}

      {view === 'in' && (
        <div className="fin-list">
          <p className="hint">
            Two kinds of money in: payments that arrived against an invoice, and sales written on
            a piece. A piece that was sold <em>and</em> invoiced is the same money twice — tick it
            as invoiced and the invoice payment stands for it.
          </p>
          {yearIncome.length === 0 ? (
            <div className="empty">
              <h3>Nothing recorded for {year}</h3>
              <p>Record a payment on an invoice, or a sale on a piece in Artwork.</p>
            </div>
          ) : (
            <ul className="fin-rows">
              {yearIncome.map((row) => (
                <li key={row.id}>
                  <span className="fin-when">{row.date}</span>
                  <span className="fin-what">
                    {row.invoiceId ? (
                      <button
                        className="fin-open"
                        title="Open this invoice"
                        onClick={() => props.onOpenInvoice(row.invoiceId!)}
                      >
                        {row.what}
                      </button>
                    ) : (
                      row.what
                    )}
                    <span className="fnd-detail">
                      {row.source === 'invoice' ? 'Invoice payment' : 'Sale of a piece'}
                      {row.who ? ` · ${row.who}` : ''}
                    </span>
                  </span>
                  <span className="fin-money">
                    {row.amount === null ? (
                      <span className="faint">No figure recorded</span>
                    ) : (
                      <>
                        {money(row.amount)}
                        {row.fee !== null && (
                          <span className="faint"> · kept {money(keptOf(row) ?? 0)}</span>
                        )}
                      </>
                    )}
                  </span>
                  {row.source === 'piece' && (
                    <button
                      className="btn"
                      data-variant="quiet"
                      onClick={() => props.onMarkInvoiced(row.id.replace('piece:', ''), true)}
                    >
                      Also invoiced
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {alsoInvoiced.length > 0 && (
            <div className="fin-invoiced">
              <h4>Counted as invoice payments instead</h4>
              <ul>
                {alsoInvoiced.map((photo) => (
                  <li key={photo.id}>
                    {photo.title} · {photo.sale?.date}
                    <button
                      className="btn"
                      data-variant="quiet"
                      onClick={() => props.onMarkInvoiced(photo.id, false)}
                    >
                      Count this sale after all
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="chip-row">
            <button
              className="btn"
              data-variant="quiet"
              disabled={yearIncome.length === 0}
              onClick={() => {
                downloadText(incomeCsv(yearIncome, currency), `money-in-${year}.csv`);
                props.onMessage('Money in saved as a CSV.');
              }}
            >
              Export money in
            </button>
          </div>
        </div>
      )}

      {view === 'owed' && (
        <div className="fin-list">
          <p className="hint">
            Money asked for that has not arrived: invoices with a balance left on them, and
            commissions that were issued and never invoiced. Nothing new is recorded here — every
            row opens the invoice or the commission it stands for. It ignores the year, because
            money owed from two years ago is exactly what this list is for.
          </p>

          {owed.length === 0 ? (
            <div className="empty">
              <h3>Nothing outstanding</h3>
              <p>Every invoice is paid off, and no issued commission is waiting to be invoiced.</p>
            </div>
          ) : (
            <>
              <div className="fin-figures">
                {owedByCurrency.map((total) => {
                  const sent = total.rows - total.notYetSent;
                  return (
                    <div key={total.currency}>
                      <span className="k">Due in {total.currency}</span>
                      {/* Drafts are not in this figure, so when every row is a
                          draft the honest headline is that nothing has been
                          asked for — not $0.00, which reads as "all paid". */}
                      <strong>
                        {sent === 0 ? 'Nothing asked for yet' : formatMoney(total.due, total.currency)}
                      </strong>
                      <span className="hint">
                        {sent > 0
                          ? `${sent} ${sent === 1 ? 'record' : 'records'} sent and unpaid`
                          : 'Nothing has been given to a client yet'}
                        {total.notYetSent > 0
                          ? ` · ${total.notYetSent} draft ${
                              total.notYetSent === 1 ? 'invoice' : 'invoices'
                            } worth ${formatMoney(
                              total.notYetSentDue,
                              total.currency,
                            )} left out, because nobody has been sent them`
                          : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
              {owedByCurrency.length > 1 && (
                <p className="notice">
                  These are in different currencies and are not added together: nothing in this app
                  knows an exchange rate, and one figure across both would be invented.
                </p>
              )}

              <ul className="fin-rows">
                {owed.map((row) => {
                  const late = isOverdue(row, today);
                  const waiting = daysWaiting(row, today);
                  return (
                    <li key={row.id}>
                      <span className="fin-when">{row.since}</span>
                      <span className="fin-what">
                        <button
                          className="fin-open"
                          title={
                            row.source === 'invoice'
                              ? 'Open this invoice'
                              : 'Open this commission'
                          }
                          onClick={() =>
                            row.source === 'invoice'
                              ? props.onOpenInvoice(row.recordId)
                              : props.onOpenDocument(row.recordId)
                          }
                        >
                          {row.ref} · {row.what}
                        </button>
                        <span className="fnd-detail">
                          {row.source === 'invoice' ? 'Invoice' : 'Commission, never invoiced'}
                          {row.who ? ` · ${row.who}` : ''}
                          {row.paid > 0
                            ? ` · ${formatMoney(row.paid, row.currency)} of ${formatMoney(
                                row.total,
                                row.currency,
                              )} paid`
                            : ''}
                          {row.notYetSent
                            ? ' · still a draft, not sent'
                            : row.dueDate === null
                              ? ` · no due date set · waiting ${waiting} ${
                                  waiting === 1 ? 'day' : 'days'
                                }`
                              : ` · due ${row.dueDate}`}
                        </span>
                      </span>
                      <span className="fin-money">
                        {formatMoney(row.due, row.currency)}
                        {late && <span className="fin-late"> · overdue</span>}
                      </span>
                      <button
                        className="btn"
                        data-variant="quiet"
                        onClick={() =>
                          row.source === 'invoice'
                            ? props.onOpenInvoice(row.recordId)
                            : props.onOpenDocument(row.recordId)
                        }
                      >
                        Open
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {view === 'out' && (
        <div className="fin-out">
          <div className="fin-add">
            <h4>Write something down</h4>
            <div className="field-row">
              <div className="field">
                <label htmlFor="fin-date">Date</label>
                <input
                  id="fin-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="fin-cat">What kind</label>
                <select
                  id="fin-cat"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as ExpenseCategory })
                  }
                >
                  {CATEGORIES.map((one) => (
                    <option key={one.id} value={one.id}>
                      {one.label}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  {CATEGORIES.find((one) => one.id === draft.category)?.hint ?? ' '}
                </span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="fin-what">What it was</label>
              <div className="fin-with-mic">
                <input
                  id="fin-what"
                  value={draft.what}
                  placeholder="Canvas and stretcher bars"
                  onChange={(e) => setDraft({ ...draft, what: e.target.value })}
                />
                <Dictate
                  label="what it was"
                  onText={(said) =>
                    setDraft((current) => ({
                      ...current,
                      what: current.what ? `${current.what} ${said}` : said,
                    }))
                  }
                />
              </div>
            </div>

            {isMileage ? (
              <div className="field">
                <label htmlFor="fin-miles">Miles driven</label>
                <input
                  id="fin-miles"
                  inputMode="decimal"
                  value={draft.miles}
                  placeholder="120"
                  onChange={(e) => setDraft({ ...draft, miles: e.target.value })}
                />
                <span className="hint">
                  {props.mileageRate === null
                    ? 'No rate set, so this row records the miles and no figure. Set one below.'
                    : mileagePreview === null
                      ? `At ${money(props.mileageRate)} a mile.`
                      : `${money(props.mileageRate)} a mile — ${money(mileagePreview)}.`}
                </span>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="fin-amount">What it cost</label>
                <input
                  id="fin-amount"
                  inputMode="decimal"
                  value={draft.amount}
                  placeholder="Leave blank if you do not know yet"
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
                <span className="hint">Blank is not nothing — it means it is not written down.</span>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label htmlFor="fin-job">What it was for</label>
                <input
                  id="fin-job"
                  value={draft.jobRef}
                  placeholder="Santa Fe show, the Ruiz triptych"
                  onChange={(e) => setDraft({ ...draft, jobRef: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="fin-note">Note</label>
                <div className="fin-with-mic">
                  <input
                    id="fin-note"
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  />
                  <Dictate
                    label="a note"
                    onText={(said) =>
                      setDraft((current) => ({
                        ...current,
                        note: current.note ? `${current.note} ${said}` : said,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label>Receipt</label>
              <div className="chip-row">
                <button
                  className="btn"
                  data-variant="quiet"
                  disabled={busy}
                  onClick={() => receiptInput.current?.click()}
                >
                  {busy ? 'Adding…' : 'Photograph or choose a receipt'}
                </button>
                {draft.receiptImageIds.map((id) => (
                  <img key={id} className="fin-receipt" src={props.imageUrls[id]} alt="Receipt" />
                ))}
              </div>
              <input
                ref={receiptInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                multiple
                className="sr-only"
                onChange={async (e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (chosen.length === 0) return;
                  setBusy(true);
                  try {
                    const ids = await props.onAddReceipts(chosen);
                    setDraft((current) => ({
                      ...current,
                      receiptImageIds: [...current.receiptImageIds, ...ids],
                    }));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>

            <div className="chip-row">
              <button
                className="btn"
                data-variant="primary"
                disabled={Boolean(problem)}
                onClick={saveDraft}
              >
                Write it down
              </button>
              {problem && <span className="hint">{problem}</span>}
            </div>
          </div>

          <div className="fin-list">
            <div className="fin-rate">
              <label htmlFor="fin-rate">Mileage rate</label>
              <input
                id="fin-rate"
                inputMode="decimal"
                defaultValue={props.mileageRate === null ? '' : String(props.mileageRate / 100)}
                placeholder="Not set"
                onBlur={(e) => props.onMileageRate(parseMoney(e.target.value))}
              />
              <span className="hint">
                Per mile, as you set it. No rate ships with this app: it changes every year and is
                different everywhere, and one baked in would be wrong on somebody's return. A row
                keeps the rate it was written at.
              </span>
            </div>

            {yearSpend.length === 0 ? (
              <div className="empty">
                <h3>Nothing written down for {year}</h3>
                <p>Materials, fuel, a night away, a booth fee — it all goes here.</p>
              </div>
            ) : (
              <ul className="fin-rows">
                {yearSpend.map((one) => (
                  <li key={one.id}>
                    <span className="fin-when">{one.date}</span>
                    <span className="fin-what">
                      {one.what}
                      <span className="fnd-detail">
                        {describeCategory(one.category)}
                        {one.jobRef ? ` · ${one.jobRef}` : ''}
                        {one.miles !== null ? ` · ${one.miles} miles` : ''}
                        {one.note ? ` · ${one.note}` : ''}
                      </span>
                    </span>
                    <span className="fin-money">
                      {one.amount === null ? (
                        <span className="faint">No figure</span>
                      ) : (
                        money(one.amount)
                      )}
                    </span>
                    {one.receiptImageIds.length > 0 && (
                      <span className="fin-receipts">
                        {one.receiptImageIds.map((id) =>
                          props.imageUrls[id] ? (
                            <img key={id} src={props.imageUrls[id]} alt="Receipt" />
                          ) : null,
                        )}
                      </span>
                    )}
                    <button
                      className="btn"
                      data-variant="quiet"
                      onClick={() => props.onDeleteExpense(one.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="chip-row">
              <span className="hint">{describeTally(tally(yearSpend.map((one) => one.amount)), money)}</span>
              <button
                className="btn"
                data-variant="quiet"
                disabled={yearSpend.length === 0}
                onClick={() => {
                  downloadText(expensesCsv(yearSpend, currency), `money-out-${year}.csv`);
                  props.onMessage('Money out saved as a CSV.');
                }}
              >
                Export money out
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'statement' && (
        <div className="fin-statement">
          <p className="hint">
            One page for your accountant: your letterhead, the year, both sides, and what is left.
            It prints straight to PDF, and it says at the bottom how many rows had no figure —
            because a statement that looks complete and is not is worse than one that says where
            to look.
          </p>
          <iframe
            className="fin-preview"
            title={`Profit and loss for ${year}`}
            srcDoc={renderStatement(yearIncome, yearSpend, statementContext())}
          />
          <div className="chip-row">
            <button
              className="btn"
              data-variant="primary"
              onClick={() => {
                const context = statementContext();
                downloadText(
                  renderStatement(yearIncome, yearSpend, context),
                  `${statementFileStem(context)}.html`,
                  'text/html',
                );
                props.onMessage('Statement saved. Open it and print to PDF, or email it as it is.');
              }}
            >
              Save the statement
            </button>
            <button
              className="btn"
              onClick={() => {
                downloadText(ledgerCsv(yearIncome, yearSpend, currency), `ledger-${year}.csv`);
                props.onMessage('Both sides on one sheet — money out written negative.');
              }}
            >
              Export everything as a CSV
            </button>
            <span className="hint">
              The CSV opens in Google Sheets or Excel, and imports into QuickBooks.
            </span>
          </div>
          <div className="chip-row">
            <button className="btn" data-variant="quiet" onClick={() => props.onExportBooks()}>
              Save the books as a file
            </button>
            <label className="btn" data-variant="quiet">
              Read a books file back in
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) props.onImportBooks(file);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="hint">
              This one comes back: every row exactly as you wrote it, for moving the books to
              another device. Receipt photographs stay here, and a row already in the books is
              left alone rather than added twice.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function downloadText(text: string, fileName: string, mime = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
