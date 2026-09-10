import { calculateTotals, formatMoney, lineTotal } from '../calc';
import type { ClientFacing } from '../types';

interface Props {
  /**
   * Deliberately typed as ClientFacing, not CommissionDocument. Private notes
   * and internal fields are not merely hidden by CSS — they are not in the
   * data this component receives, so they cannot reach the printed page.
   */
  doc: ClientFacing;
  imageUrls: Record<string, string>;
  /** Set when viewing a frozen issued copy rather than the working draft. */
  issued: { version: number; issuedAt: string } | null;
}

function line(value: string | null | undefined): string | null {
  return value && value.trim() !== '' ? value : null;
}

function dimensions(doc: ClientFacing): string | null {
  const { width, height, depth, unit } = doc.artwork;
  if (width === null || height === null) return null;
  const base = `${width} × ${height}`;
  return depth === null ? `${base} ${unit}` : `${base} × ${depth} ${unit}`;
}

export function ClientPreview({ doc, imageUrls, issued }: Props) {
  const totals = calculateTotals(doc.quote, doc.payments, doc.deposit);
  const currency = doc.quote.currency;
  const logoUrl = doc.studio.logoImageId ? imageUrls[doc.studio.logoImageId] : undefined;

  const studioLines = [line(doc.studio.address), line(doc.studio.email), line(doc.studio.phone)]
    .filter(Boolean)
    .join('\n');

  return (
    <article className="client-doc">
      <header className="doc-head">
        <div>
          {logoUrl && <img className="logo" src={logoUrl} alt={`${doc.studio.name} logo`} />}
          <h1>{doc.studio.name || 'Studio name not set'}</h1>
          <div className="studio-line">{studioLines}</div>
        </div>
        <div className="meta">
          <div className="num">{doc.documentNumber}</div>
          <div>{doc.title || 'Commission document'}</div>
          <div>{doc.createdDate}</div>
          {issued && (
            <div>
              Issued version {issued.version} · {issued.issuedAt.slice(0, 10)}
            </div>
          )}
        </div>
      </header>

      <section>
        <h2>Prepared for</h2>
        <div className="pair-grid">
          <dl>
            <dt>Client</dt>
            <dd>{doc.client.name || 'Not set'}</dd>
            {line(doc.client.email) && (
              <>
                <dt>Email</dt>
                <dd>{doc.client.email}</dd>
              </>
            )}
            {line(doc.client.phone) && (
              <>
                <dt>Phone</dt>
                <dd>{doc.client.phone}</dd>
              </>
            )}
          </dl>
          <dl>
            {line(doc.client.billingAddress) && (
              <>
                <dt>Billing address</dt>
                <dd>{doc.client.billingAddress}</dd>
              </>
            )}
            {line(doc.client.projectAddress) && (
              <>
                <dt>Project address</dt>
                <dd>{doc.client.projectAddress}</dd>
              </>
            )}
          </dl>
        </div>
      </section>

      <section>
        <h2>The work</h2>
        <p style={{ marginTop: 0, whiteSpace: 'pre-line' }}>
          {doc.artwork.description || 'Not yet described.'}
        </p>
        <div className="pair-grid">
          <dl>
            {dimensions(doc) && (
              <>
                <dt>Dimensions</dt>
                <dd>{dimensions(doc)}</dd>
              </>
            )}
            {line(doc.artwork.materials) && (
              <>
                <dt>Materials</dt>
                <dd>{doc.artwork.materials}</dd>
              </>
            )}
          </dl>
          <dl>
            {line(doc.artwork.finish) && (
              <>
                <dt>Finish</dt>
                <dd>{doc.artwork.finish}</dd>
              </>
            )}
          </dl>
        </div>
        {doc.artwork.referenceImageIds.length > 0 && (
          <div className="refs">
            {doc.artwork.referenceImageIds.map((id) =>
              imageUrls[id] ? <img key={id} src={imageUrls[id]} alt="Reference" /> : null,
            )}
          </div>
        )}
      </section>

      {(doc.schedule.targetCompletionDate || line(doc.schedule.deliveryNotes)) && (
        <section>
          <h2>Schedule</h2>
          <dl>
            {doc.schedule.targetCompletionDate && (
              <>
                <dt>Target completion</dt>
                <dd>{doc.schedule.targetCompletionDate}</dd>
              </>
            )}
            {line(doc.schedule.deliveryNotes) && (
              <>
                <dt>Delivery and installation</dt>
                <dd style={{ whiteSpace: 'pre-line' }}>{doc.schedule.deliveryNotes}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      <section>
        <h2>Quote</h2>
        <table className="quote">
          <thead>
            <tr>
              <th>Description</th>
              <th className="amount">Qty</th>
              <th className="amount">Unit</th>
              <th className="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.quote.lineItems.map((item) => (
              <tr key={item.id}>
                <td>{item.description || <span style={{ color: '#9a9082' }}>Not described</span>}</td>
                <td className="amount">{item.quantity}</td>
                <td className="amount">{formatMoney(item.unitPrice, currency)}</td>
                <td className="amount">{formatMoney(lineTotal(item), currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-totals">
          <div>
            <span>Subtotal</span>
            <span>{formatMoney(totals.subtotal, currency)}</span>
          </div>
          <div>
            <span>{doc.quote.taxRatePct === null ? 'Tax' : `Tax (${doc.quote.taxRatePct}%)`}</span>
            <span>{totals.tax === null ? 'Not applied' : formatMoney(totals.tax, currency)}</span>
          </div>
          <div className="grand">
            <span>Total</span>
            <span>{formatMoney(totals.total, currency)}</span>
          </div>
          {totals.depositRequired !== null && (
            <div>
              <span>Deposit requested</span>
              <span>{formatMoney(totals.depositRequired, currency)}</span>
            </div>
          )}
          <div>
            <span>Received to date</span>
            <span>{formatMoney(totals.paid, currency)}</span>
          </div>
          <div className={totals.credit === null ? '' : 'credit'}>
            <span>{totals.credit === null ? 'Balance due' : 'Credit on account'}</span>
            <span>{formatMoney(totals.credit ?? totals.balance, currency)}</span>
          </div>
        </div>
      </section>

      {doc.payments.length > 0 && (
        <section>
          <h2>Payments received</h2>
          <table className="quote">
            <thead>
              <tr>
                <th>Date</th>
                <th>Note</th>
                <th className="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.date}</td>
                  <td>{payment.note ?? ''}</td>
                  <td className="amount">{formatMoney(payment.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(line(doc.terms.body) || line(doc.terms.revisionAllowance) || line(doc.terms.cancellation)) && (
        <section>
          <h2>Terms</h2>
          {line(doc.terms.body) && <div className="terms-body">{doc.terms.body}</div>}
          {line(doc.terms.revisionAllowance) && (
            <p>
              <strong>Revisions.</strong> {doc.terms.revisionAllowance}
            </p>
          )}
          {line(doc.terms.cancellation) && (
            <p>
              <strong>Cancellation.</strong> {doc.terms.cancellation}
            </p>
          )}
        </section>
      )}

      <footer className="doc-foot">
        {doc.documentNumber} · {doc.studio.name || 'Studio'}
        {/* Stated because the artist writes these terms themselves. */}
        <div>These terms are set by the studio and have not been reviewed by a lawyer.</div>
      </footer>
    </article>
  );
}
