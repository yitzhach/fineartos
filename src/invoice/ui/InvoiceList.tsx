import { calculateTotals, formatMoney } from '../../commission/calc';
import type { Invoice } from '../types';

interface Props {
  invoices: Invoice[];
  onOpen: (id: string) => void;
  onNew: () => void;
}

const NO_DEPOSIT = { kind: 'percent' as const, value: null };

/** Every invoice, newest first, with what is actually outstanding on each. */
export function InvoiceList({ invoices, onOpen, onNew }: Props) {
  if (invoices.length === 0) {
    return (
      <div className="empty">
        <h3>No invoices yet</h3>
        <p>An invoice copies a commission as it stands, so what you send stays what you sent.</p>
        <button className="btn" data-variant="primary" onClick={onNew}>New invoice</button>
      </div>
    );
  }

  const outstanding = invoices.reduce((sum, invoice) => {
    const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
    return sum + Math.max(0, totals.balance);
  }, 0);

  return (
    <>
      <div className="pj-pane-head">
        <p className="hint" style={{ margin: 0 }}>
          {/* Summed from the invoices themselves, in their own currency where
              they share one. Nothing is converted, because nothing here knows
              an exchange rate. */}
          {formatMoney(outstanding, invoices[0]?.quote.currency ?? 'USD')} outstanding across{' '}
          {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}.
        </p>
        <button className="btn" data-variant="primary" onClick={onNew}>New invoice</button>
      </div>

      <ul className="doc-list">
        {invoices.map((invoice) => {
          const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
          return (
            <li key={invoice.id} className="doc-row" onDoubleClick={() => onOpen(invoice.id)}>
              <span className="grow">
                <span className="num">{invoice.invoiceNumber}</span>
                <br />
                <span className="name">{invoice.client.name.trim() || 'No client set'}</span>
              </span>
              <span className="badge" data-state={invoice.state}>{invoice.state}</span>
              <span>
                {totals.credit !== null
                  ? `${formatMoney(totals.credit, invoice.quote.currency)} credit`
                  : `${formatMoney(totals.balance, invoice.quote.currency)} due`}
              </span>
              <button className="btn" onClick={() => onOpen(invoice.id)}>Open</button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
