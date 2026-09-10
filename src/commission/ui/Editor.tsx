import { ImageDrop } from '../../os/ImageDrop';
import { calculateTotals, formatMoney, lineTotal, parseMoney, validateQuote } from '../calc';
import { emptyLineItem, newId } from '../document';
import type { CommissionDocument, LineItem, Payment } from '../types';

interface Props {
  doc: CommissionDocument;
  onChange: (changes: Partial<CommissionDocument>) => void;
  imageUrls: Record<string, string>;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  imageError: string | null;
}

/** A text input whose empty state means "not known", stored as null. */
function nullable(value: string): string | null {
  return value.trim() === '' ? null : value;
}

function moneyInput(value: number): string {
  return (value / 100).toFixed(2);
}

export function Editor({ doc, onChange, imageUrls, onAddImages, onRemoveImage, imageError }: Props) {
  const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
  const issues = validateQuote(doc.quote, doc.payments, doc.deposit);
  const currency = doc.quote.currency;

  const setLine = (id: string, changes: Partial<LineItem>) =>
    onChange({
      quote: {
        ...doc.quote,
        lineItems: doc.quote.lineItems.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      },
    });

  const addLine = (kind: LineItem['kind']) =>
    onChange({ quote: { ...doc.quote, lineItems: [...doc.quote.lineItems, emptyLineItem(kind)] } });

  const removeLine = (id: string) =>
    onChange({ quote: { ...doc.quote, lineItems: doc.quote.lineItems.filter((i) => i.id !== id) } });

  const addPayment = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const amount = parseMoney(String(data.get('amount') ?? ''));
    if (amount === null || amount <= 0) return;
    const payment: Payment = {
      id: newId(),
      date: String(data.get('date') || new Date().toISOString().slice(0, 10)),
      amount,
      note: nullable(String(data.get('note') ?? '')),
    };
    onChange({ payments: [...doc.payments, payment] });
    form.reset();
  };

  return (
    <div>
      {doc.isDemo && (
        <div className="notice">
          This is demo data, included so the app is not empty on first run. Delete it
          whenever you like.
        </div>
      )}

      {issues.length > 0 && (
        <div className="notice" data-tone="error">
          These figures need fixing before the document is reliable:
          <ul>
            {issues.map((issue) => (
              <li key={issue.path}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="section">
        <legend>Studio</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="studio-name">Artist or business name</label>
            <input
              id="studio-name"
              type="text"
              value={doc.studio.name}
              onChange={(e) => onChange({ studio: { ...doc.studio, name: e.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="studio-email">Email</label>
            <input
              id="studio-email"
              type="email"
              value={doc.studio.email ?? ''}
              onChange={(e) => onChange({ studio: { ...doc.studio, email: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="studio-phone">Phone</label>
            <input
              id="studio-phone"
              type="tel"
              value={doc.studio.phone ?? ''}
              onChange={(e) => onChange({ studio: { ...doc.studio, phone: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="studio-address">Address</label>
            <input
              id="studio-address"
              type="text"
              value={doc.studio.address ?? ''}
              onChange={(e) => onChange({ studio: { ...doc.studio, address: nullable(e.target.value) } })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Document</legend>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="doc-number">Number</label>
            <input id="doc-number" type="text" value={doc.documentNumber} readOnly />
            <span className="hint">Assigned automatically and never reused.</span>
          </div>
          <div className="field">
            <label htmlFor="doc-title">Title</label>
            <input
              id="doc-title"
              type="text"
              value={doc.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="doc-date">Created</label>
            <input
              id="doc-date"
              type="date"
              value={doc.createdDate}
              onChange={(e) => onChange({ createdDate: e.target.value })}
            />
          </div>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          State: {doc.state} · version {doc.version}
          {doc.issuedSnapshots.length > 0 &&
            ` · ${doc.issuedSnapshots.length} issued version${doc.issuedSnapshots.length > 1 ? 's' : ''} kept`}
        </p>
      </fieldset>

      <fieldset className="section">
        <legend>Client</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="client-name">Name</label>
            <input
              id="client-name"
              type="text"
              value={doc.client.name}
              onChange={(e) => onChange({ client: { ...doc.client, name: e.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="client-email">Email</label>
            <input
              id="client-email"
              type="email"
              value={doc.client.email ?? ''}
              onChange={(e) => onChange({ client: { ...doc.client, email: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="client-phone">Phone</label>
            <input
              id="client-phone"
              type="tel"
              value={doc.client.phone ?? ''}
              onChange={(e) => onChange({ client: { ...doc.client, phone: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="client-source">Source or show</label>
            <input
              id="client-source"
              type="text"
              value={doc.client.source ?? ''}
              onChange={(e) => onChange({ client: { ...doc.client, source: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="client-billing">Billing address</label>
            <textarea
              id="client-billing"
              value={doc.client.billingAddress ?? ''}
              onChange={(e) => onChange({ client: { ...doc.client, billingAddress: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="client-project">Project address</label>
            <textarea
              id="client-project"
              value={doc.client.projectAddress ?? ''}
              onChange={(e) => onChange({ client: { ...doc.client, projectAddress: nullable(e.target.value) } })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Artwork</legend>
        <div className="field">
          <label htmlFor="art-desc">Description</label>
          <textarea
            id="art-desc"
            value={doc.artwork.description}
            onChange={(e) => onChange({ artwork: { ...doc.artwork, description: e.target.value } })}
          />
        </div>
        <div className="grid-2">
          <div className="grid-3">
            <div className="field">
              <label htmlFor="art-w">Width</label>
              <input
                id="art-w"
                type="number"
                value={doc.artwork.width ?? ''}
                onChange={(e) =>
                  onChange({
                    artwork: { ...doc.artwork, width: e.target.value === '' ? null : Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="art-h">Height</label>
              <input
                id="art-h"
                type="number"
                value={doc.artwork.height ?? ''}
                onChange={(e) =>
                  onChange({
                    artwork: { ...doc.artwork, height: e.target.value === '' ? null : Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="art-d">Depth</label>
              <input
                id="art-d"
                type="number"
                value={doc.artwork.depth ?? ''}
                onChange={(e) =>
                  onChange({
                    artwork: { ...doc.artwork, depth: e.target.value === '' ? null : Number(e.target.value) },
                  })
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="art-unit">Units</label>
            <select
              id="art-unit"
              value={doc.artwork.unit}
              onChange={(e) =>
                onChange({ artwork: { ...doc.artwork, unit: e.target.value as 'in' | 'cm' } })
              }
            >
              <option value="in">inches</option>
              <option value="cm">centimetres</option>
            </select>
            <span className="hint">Always printed next to the dimensions.</span>
          </div>
          <div className="field">
            <label htmlFor="art-materials">Materials</label>
            <input
              id="art-materials"
              type="text"
              value={doc.artwork.materials ?? ''}
              onChange={(e) => onChange({ artwork: { ...doc.artwork, materials: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="art-finish">Finish</label>
            <input
              id="art-finish"
              type="text"
              value={doc.artwork.finish ?? ''}
              onChange={(e) => onChange({ artwork: { ...doc.artwork, finish: nullable(e.target.value) } })}
            />
          </div>
        </div>

        <div className="field">
          <label id="art-images-label">Reference images</label>
          {/* The first image becomes the project's thumbnail on the desktop,
              so the order these are added in is meaningful. */}
          <ImageDrop
            onFiles={onAddImages}
            error={imageError}
            label="Drop reference images here"
            hint="or click to choose · PNG, JPEG, WebP · up to 8 MB each"
          >
            {doc.artwork.referenceImageIds.map((id, index) => (
              <figure className="ref-image" key={id}>
                {imageUrls[id] ? (
                  <img src={imageUrls[id]} alt={`Reference ${index + 1}`} />
                ) : (
                  <span className="missing">Not on this device</span>
                )}
                {index === 0 && <figcaption>Thumbnail</figcaption>}
                <button
                  className="remove"
                  aria-label={`Remove reference image ${index + 1}`}
                  onClick={() => onRemoveImage(id)}
                >
                  ✕
                </button>
              </figure>
            ))}
          </ImageDrop>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Schedule</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="sched-date">Target completion</label>
            <input
              id="sched-date"
              type="date"
              value={doc.schedule.targetCompletionDate ?? ''}
              onChange={(e) =>
                onChange({ schedule: { ...doc.schedule, targetCompletionDate: nullable(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="sched-notes">Delivery and installation notes</label>
            <textarea
              id="sched-notes"
              value={doc.schedule.deliveryNotes ?? ''}
              onChange={(e) => onChange({ schedule: { ...doc.schedule, deliveryNotes: nullable(e.target.value) } })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Quote</legend>
        <div className="lines-scroll">
          <table className="lines">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 110 }}>Kind</th>
                <th className="amount" style={{ width: 78 }}>Qty</th>
                <th className="amount" style={{ width: 110 }}>Unit price</th>
                <th className="amount" style={{ width: 100 }}>Amount</th>
                <th style={{ width: 40 }}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {doc.quote.lineItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="text"
                      aria-label="Line description"
                      value={item.description}
                      onChange={(e) => setLine(item.id, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label="Line kind"
                      value={item.kind}
                      onChange={(e) => setLine(item.id, { kind: e.target.value as LineItem['kind'] })}
                    >
                      <option value="artwork">Artwork</option>
                      <option value="delivery">Delivery</option>
                      <option value="installation">Installation</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Quantity"
                      value={item.quantity}
                      onChange={(e) => setLine(item.id, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Unit price"
                      defaultValue={moneyInput(item.unitPrice)}
                      onBlur={(e) => setLine(item.id, { unitPrice: parseMoney(e.target.value) ?? 0 })}
                    />
                  </td>
                  <td className="amount" style={{ paddingTop: 12 }}>
                    {formatMoney(lineTotal(item), currency)}
                  </td>
                  <td>
                    <button
                      className="btn"
                      data-variant="quiet"
                      onClick={() => removeLine(item.id)}
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button className="btn" onClick={() => addLine('artwork')}>Add artwork line</button>
          <button className="btn" onClick={() => addLine('delivery')}>Add delivery</button>
          <button className="btn" onClick={() => addLine('installation')}>Add installation</button>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="tax-rate">Tax rate (%)</label>
            <input
              id="tax-rate"
              type="number"
              min="0"
              max="100"
              step="any"
              value={doc.quote.taxRatePct ?? ''}
              onChange={(e) =>
                onChange({
                  quote: { ...doc.quote, taxRatePct: e.target.value === '' ? null : Number(e.target.value) },
                })
              }
            />
            <span className="hint">
              Left blank, no tax is shown at all — the document says tax was not applied
              rather than showing zero.
            </span>
          </div>
          <div className="field">
            <label htmlFor="currency">Currency</label>
            <input
              id="currency"
              type="text"
              value={currency}
              onChange={(e) => onChange({ quote: { ...doc.quote, currency: e.target.value.toUpperCase() } })}
              maxLength={3}
            />
            <span className="hint">One currency per document. No conversion.</span>
          </div>
        </div>

        <div className="totals">
          <div><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
          <div>
            <span>Tax</span>
            <span>{totals.tax === null ? 'Not applied' : formatMoney(totals.tax, currency)}</span>
          </div>
          <div className="grand"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Deposit and payments</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="dep-kind">Deposit requested as</label>
            <select
              id="dep-kind"
              value={doc.deposit.kind}
              onChange={(e) =>
                onChange({ deposit: { ...doc.deposit, kind: e.target.value as 'amount' | 'percent' } })
              }
            >
              <option value="percent">Percentage of total</option>
              <option value="amount">Fixed amount</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dep-value">
              {doc.deposit.kind === 'percent' ? 'Percentage' : 'Amount'}
            </label>
            <input
              id="dep-value"
              type="text"
              inputMode="decimal"
              defaultValue={
                doc.deposit.value === null
                  ? ''
                  : doc.deposit.kind === 'percent'
                    ? String(doc.deposit.value)
                    : moneyInput(doc.deposit.value)
              }
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const value =
                  raw === ''
                    ? null
                    : doc.deposit.kind === 'percent'
                      ? Number(raw)
                      : parseMoney(raw);
                onChange({ deposit: { ...doc.deposit, value } });
              }}
            />
            <span className="hint">A deposit requested is not money received.</span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addPayment(e.currentTarget);
          }}
        >
          <div className="grid-3">
            <div className="field">
              <label htmlFor="pay-date">Payment date</label>
              <input id="pay-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="field">
              <label htmlFor="pay-amount">Amount received</label>
              <input id="pay-amount" name="amount" type="text" inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="field">
              <label htmlFor="pay-note">Note</label>
              <input id="pay-note" name="note" type="text" />
            </div>
          </div>
          <button className="btn" type="submit">Record payment</button>
        </form>

        {doc.payments.length > 0 && (
          <ul className="doc-list" style={{ marginTop: 12 }}>
            {doc.payments.map((payment) => (
              <li key={payment.id} className="doc-row">
                <span className="num">{payment.date}</span>
                <span className="grow">{payment.note ?? 'No note'}</span>
                <span>{formatMoney(payment.amount, currency)}</span>
                <button
                  className="btn"
                  data-variant="quiet"
                  onClick={() => onChange({ payments: doc.payments.filter((p) => p.id !== payment.id) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="totals">
          <div>
            <span>Deposit requested</span>
            <span>{formatMoney(totals.depositRequired, currency)}</span>
          </div>
          <div><span>Received</span><span>{formatMoney(totals.paid, currency)}</span></div>
          <div className={totals.credit === null ? 'grand' : 'grand credit'}>
            <span>{totals.credit === null ? 'Balance due' : 'Credit on account'}</span>
            <span>{formatMoney(totals.credit ?? totals.balance, currency)}</span>
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Terms</legend>
        <div className="field">
          <label htmlFor="terms-body">Terms</label>
          <textarea
            id="terms-body"
            value={doc.terms.body ?? ''}
            onChange={(e) => onChange({ terms: { ...doc.terms, body: nullable(e.target.value) } })}
          />
          <span className="hint">
            Your words, printed as written. Nothing here has been reviewed by a lawyer.
          </span>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="terms-rev">Revision allowance</label>
            <textarea
              id="terms-rev"
              value={doc.terms.revisionAllowance ?? ''}
              onChange={(e) => onChange({ terms: { ...doc.terms, revisionAllowance: nullable(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label htmlFor="terms-cancel">Cancellation</label>
            <textarea
              id="terms-cancel"
              value={doc.terms.cancellation ?? ''}
              onChange={(e) => onChange({ terms: { ...doc.terms, cancellation: nullable(e.target.value) } })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Private notes</legend>
        <div className="field">
          <label htmlFor="private-notes">Internal only</label>
          <textarea
            id="private-notes"
            value={doc.privateNotes ?? ''}
            onChange={(e) => onChange({ privateNotes: nullable(e.target.value) })}
          />
          <span className="hint">
            Never printed, never exported to the client, never part of an issued version.
          </span>
        </div>
      </fieldset>
    </div>
  );
}
