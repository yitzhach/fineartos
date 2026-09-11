import { calculateTotals, formatMoney } from '../calc';
import type { CommissionDocument } from '../types';
import type { Invoice } from '../../invoice/types';

/** "Sep 11, 2026" — the long form wraps the narrow fact column onto two lines. */
function shortDate(iso: string | null): string {
  if (!iso) return 'Not set';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

interface Props {
  doc: CommissionDocument;
  invoices: Invoice[];
  imageUrls: Record<string, string>;
  onEdit: () => void;
  onPreview: () => void;
  onNewInvoice: () => void;
  onOpenInvoice: (id: string) => void;
  /** Present only for the seeded demo record. */
  onRemoveDemo?: () => void;
}

/**
 * The commission at a glance: what it is, what it is worth, what has been
 * paid, what has happened, and what to do next.
 *
 * Everything on this screen is derived from the record. There is no activity
 * feed stored anywhere and none is invented — the events below are read off
 * timestamps the document already carries, and the "next step" is worked out
 * from what is actually missing. A dashboard that shows made-up numbers is
 * worse than no dashboard, because it is believed.
 */
export function Overview({
  doc,
  invoices,
  imageUrls,
  onEdit,
  onPreview,
  onNewInvoice,
  onOpenInvoice,
  onRemoveDemo,
}: Props) {
  const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
  const currency = doc.quote.currency;
  const money = (amount: number | null) => formatMoney(amount, currency);
  const cover = doc.artwork.referenceImageIds[0];
  const coverUrl = cover ? imageUrls[cover] : undefined;

  // Percentage paid. Guarded: a zero total would divide by zero, and a
  // commission with no price yet is "not started", not "100% paid".
  const paidPct = totals.total > 0 ? Math.min(100, Math.round((totals.paid / totals.total) * 100)) : 0;

  return (
    <div className="overview">
      {doc.isDemo && (
        <div className="demo-banner">
          <span>
            <strong>Demo record.</strong> Seeded once so the app opens with something
            in it. Edit it, or remove it — it will not come back.
          </span>
          {onRemoveDemo && (
            <button className="btn" data-variant="quiet" onClick={onRemoveDemo}>
              Remove demo
            </button>
          )}
        </div>
      )}

      <header className="ov-head">
        <div className="ov-who">
          <span className="ov-avatar" aria-hidden="true">
            {initials(doc.client.name)}
          </span>
          <div>
            <h2>{doc.client.name.trim() || 'No client set'}</h2>
            <p>
              {doc.title.trim() || doc.documentNumber}
              {doc.artwork.materials ? <> · {doc.artwork.materials}</> : null}
            </p>
          </div>
        </div>

        <span className="ov-state" data-state={doc.state}>
          <span className="dot" aria-hidden="true" />
          {stateLabel(doc.state)}
        </span>

        <div className="ov-stats">
          <div>
            <span className="k">Price</span>
            <span className="v">{money(totals.total)}</span>
          </div>
          <div>
            <span className="k">Paid</span>
            <span className="v">{money(totals.paid)}</span>
          </div>
          <div>
            <span className="k">{totals.credit !== null ? 'Credit' : 'Balance'}</span>
            <span className="v due">{money(totals.credit ?? totals.balance)}</span>
          </div>
        </div>
      </header>

      <div className="ov-grid">
        <section className="ov-art card">
          {coverUrl ? (
            <img src={coverUrl} alt="" />
          ) : (
            <div className="ov-noart">
              <span className="sheet-face" aria-hidden="true" />
              <p>No reference image yet</p>
              <button className="btn" onClick={onEdit}>Add one</button>
            </div>
          )}
          <footer>
            {dimensions(doc) ?? 'Size not set'}
            {doc.artwork.materials ? ` · ${doc.artwork.materials}` : ''}
          </footer>
        </section>

        <section className="card">
          <h3>
            Project details
            <button className="btn" data-variant="quiet" onClick={onEdit}>Edit</button>
          </h3>
          <dl className="ov-facts">
            <Fact label="Client" value={doc.client.name} />
            <Fact label="Location" value={doc.client.projectAddress} />
            <Fact label="Size" value={dimensions(doc)} />
            <Fact label="Materials" value={doc.artwork.materials} />
            <Fact
              label="Timeline"
              value={
                doc.schedule.targetCompletionDate
                  ? `${shortDate(doc.createdDate)} – ${shortDate(doc.schedule.targetCompletionDate)}`
                  : null
              }
            />
          </dl>
        </section>

        <section className="card">
          <h3>
            Financials
            <button className="btn" data-variant="quiet" onClick={onPreview}>View document</button>
          </h3>
          <dl className="ov-money">
            <div>
              <dt>Price</dt>
              <dd>{money(totals.total)}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{money(totals.paid)}</dd>
            </div>
          </dl>

          {/* The bar is only drawn when there is a price to measure against. */}
          {totals.total > 0 && (
            <div className="ov-bar" role="img" aria-label={`${paidPct}% paid`}>
              <span style={{ width: `${paidPct}%` }} />
              <em>{paidPct}%</em>
            </div>
          )}

          <dl className="ov-money">
            <div className="due">
              <dt>{totals.credit !== null ? 'Credit' : 'Balance due'}</dt>
              <dd>{money(totals.credit ?? totals.balance)}</dd>
            </div>
            {totals.depositRequired !== null && (
              <div>
                <dt>Deposit requested</dt>
                <dd>{money(totals.depositRequired)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="card">
          <h3>
            Invoices
            <button className="btn" data-variant="quiet" onClick={onNewInvoice}>New</button>
          </h3>
          {invoices.length === 0 ? (
            <p className="hint">None yet. An invoice copies this commission as it stands today.</p>
          ) : (
            <ul className="ov-list">
              {invoices.map((invoice) => {
                const t = calculateTotals(invoice.quote, invoice.payments, { kind: 'percent', value: null });
                return (
                  <li key={invoice.id}>
                    <button onClick={() => onOpenInvoice(invoice.id)}>
                      <span className="n">{invoice.invoiceNumber}</span>
                      <span className="m">
                        {t.credit !== null
                          ? `${formatMoney(t.credit, invoice.quote.currency)} credit`
                          : `${formatMoney(t.balance, invoice.quote.currency)} due`}
                      </span>
                      <span className="badge" data-state={invoice.state}>{invoice.state}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Next step</h3>
          <ul className="ov-next">
            {nextSteps(doc, totals.balance, invoices.length).map((step) => (
              <li key={step}>
                <span className="tick" aria-hidden="true">→</span>
                {step}
              </li>
            ))}
          </ul>
        </section>

        <section className="card ov-act">
          <h3>Activity</h3>
          <ul className="ov-activity">
            {activity(doc, invoices).map((event) => (
              <li key={event.at + event.what}>
                <span className="when">{shortDate(event.at.slice(0, 10))}</span>
                <span className="what">{event.what}</span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Read from this record's own history. The app keeps no separate log.
          </p>
        </section>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  const shown = value?.trim();
  return (
    <div>
      <dt>{label}</dt>
      {/* An unset fact says so. It never shows a dash that could read as a value. */}
      <dd className={shown ? '' : 'unset'}>{shown || 'Not set'}</dd>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '—';
}

function stateLabel(state: CommissionDocument['state']): string {
  if (state === 'draft') return 'Draft';
  if (state === 'issued') return 'Issued';
  return 'Archived';
}

function dimensions(doc: CommissionDocument): string | null {
  const { width, height, unit } = doc.artwork;
  if (width === null || height === null) return null;
  return `${width} × ${height} ${unit}`;
}

/** What is actually missing or due, in the order it matters. */
function nextSteps(doc: CommissionDocument, balance: number, invoiceCount: number): string[] {
  const steps: string[] = [];
  if (!doc.client.name.trim()) steps.push('Add the client’s name.');
  if (doc.quote.lineItems.every((item) => item.unitPrice === 0)) steps.push('Price the work.');
  if (!doc.artwork.referenceImageIds.length) steps.push('Add a reference image — it becomes the thumbnail.');
  if (doc.state === 'draft') steps.push('Issue the document to freeze what the client was given.');
  if (invoiceCount === 0 && doc.state === 'issued') steps.push('Create an invoice for the deposit.');
  if (balance > 0 && invoiceCount > 0) steps.push('Chase the outstanding balance.');
  if (steps.length === 0) steps.push('Nothing outstanding. This one is in good shape.');
  return steps.slice(0, 4);
}

interface Event {
  at: string;
  what: string;
}

/** Events read off the record itself — no separate activity log exists. */
function activity(doc: CommissionDocument, invoices: Invoice[]): Event[] {
  const events: Event[] = [{ at: doc.createdAt, what: 'Commission created' }];

  for (const snapshot of doc.issuedSnapshots) {
    events.push({ at: snapshot.issuedAt, what: `Issued version ${snapshot.version}` });
  }
  for (const payment of doc.payments) {
    events.push({
      at: `${payment.date}T00:00:00.000Z`,
      what: payment.note?.trim() || 'Payment recorded',
    });
  }
  for (const invoice of invoices) {
    events.push({ at: invoice.createdAt, what: `Invoice ${invoice.invoiceNumber} created` });
    if (invoice.issuedAt) {
      events.push({ at: invoice.issuedAt, what: `Invoice ${invoice.invoiceNumber} issued` });
    }
  }
  if (doc.updatedAt !== doc.createdAt) {
    events.push({ at: doc.updatedAt, what: 'Last edited' });
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
}
