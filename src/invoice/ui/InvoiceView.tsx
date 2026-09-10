import { calculateTotals, formatMoney, lineTotal } from '../../commission/calc';
import { hasAnyPaymentMethod } from '../../lib/prefs';
import { formatDate, paymentLines } from '../render';
import type { Invoice } from '../types';

interface Props {
  invoice: Invoice;
  /** Object URL for the studio logo, when one has been set. */
  logoUrl?: string | null;
}

const NO_DEPOSIT = { kind: 'percent' as const, value: null };

/**
 * The client-facing receipt, on screen and on paper. It is deliberately
 * quieter than the commission document: an invoice answers "what do I owe and
 * how do I pay it", and nothing else belongs on it.
 *
 * Every figure comes from calculateTotals, so this can never disagree with the
 * editor or with the exported file.
 */
export function InvoiceView({ invoice, logoUrl }: Props) {
  const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
  const currency = invoice.quote.currency;
  const money = (amount: number | null) => formatMoney(amount, currency);
  const methods = paymentLines(invoice.paymentInstructions);

  return (
    <article className="invoice-sheet">
      <header className="inv-head">
        <div>
          {logoUrl && <img className="inv-logo" src={logoUrl} alt="" />}
          <h1>{invoice.studio.name.trim() || 'Studio name not set'}</h1>
          <p className="inv-contact">
            {[invoice.studio.email, invoice.studio.phone].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="inv-meta">
          <div className="inv-word">Invoice</div>
          <div className="inv-number">{invoice.invoiceNumber}</div>
          <div>Issued {formatDate(invoice.issueDate)}</div>
          <div>{invoice.dueDate ? `Due ${formatDate(invoice.dueDate)}` : 'No due date set'}</div>
          {invoice.state === 'draft' && <div className="inv-draft">Draft — not yet issued</div>}
        </div>
      </header>

      <section className="inv-parties">
        <div>
          <h2>Billed to</h2>
          <p className="who">{invoice.client.name.trim() || 'Client name not set'}</p>
          {invoice.client.billingAddress && <p>{invoice.client.billingAddress}</p>}
          {invoice.client.email && <p>{invoice.client.email}</p>}
        </div>
        <div>
          <h2>From</h2>
          <p className="who">{invoice.studio.name.trim() || 'Studio name not set'}</p>
          {invoice.studio.address && <p>{invoice.studio.address}</p>}
        </div>
      </section>

      <h2>Items</h2>
      <table className="inv-lines">
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Unit</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.quote.lineItems.map((item) => (
            <tr key={item.id}>
              <td>{item.description.trim() || 'Untitled item'}</td>
              <td className="num">{item.quantity}</td>
              <td className="num">{money(item.unitPrice)}</td>
              <td className="num">{money(lineTotal(item))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="inv-totals">
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td className="num">{money(totals.subtotal)}</td>
          </tr>
          <tr>
            <td>Tax{invoice.quote.taxRatePct !== null ? ` (${invoice.quote.taxRatePct}%)` : ''}</td>
            {/* Not "$0.00": no configured rate means the tax is unknown. */}
            <td className="num">{totals.tax === null ? 'Not applied' : money(totals.tax)}</td>
          </tr>
          <tr className="grand">
            <td>Total</td>
            <td className="num">{money(totals.total)}</td>
          </tr>
          {totals.paid > 0 && (
            <tr>
              <td>Paid</td>
              <td className="num">−{money(totals.paid)}</td>
            </tr>
          )}
          <tr className="due">
            <td>{totals.credit !== null ? 'Credit' : 'Balance due'}</td>
            <td className="num">{money(totals.credit ?? totals.balance)}</td>
          </tr>
        </tbody>
      </table>

      {invoice.payments.length > 0 && (
        <>
          <h2>Payments received</h2>
          <table className="inv-lines">
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    {formatDate(payment.date)}
                    {payment.note ? ` — ${payment.note}` : ''}
                  </td>
                  <td className="num">{money(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {invoice.note && <p className="inv-note">{invoice.note}</p>}

      <section className="inv-pay">
        <h2>How to pay</h2>
        {hasAnyPaymentMethod(invoice.paymentInstructions) ? (
          <dl>
            {methods.map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="inv-terms">
            No payment details have been set for this studio yet. Add them in Settings and
            they will print here.
          </p>
        )}
        {invoice.paymentInstructions.terms && (
          <p className="inv-terms">{invoice.paymentInstructions.terms}</p>
        )}
      </section>

      <footer className="inv-foot">
        {invoice.sourceDocumentNumber && <>For commission {invoice.sourceDocumentNumber}. </>}
        Thank you.
      </footer>
    </article>
  );
}
