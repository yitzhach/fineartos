import { useState } from 'react';
import { calculateTotals, formatMoney, lineTotal, parseMoney, validateQuote } from '../../commission/calc';
import { newId } from '../../commission/document';
import type { Invoice } from '../types';
import { addDays } from '../invoice';

interface Props {
  invoice: Invoice;
  onChange: (changes: Partial<Invoice>) => void;
  onRecordPayment: (payment: { date: string; amount: number; note: string | null }) => void;
}

const NO_DEPOSIT = { kind: 'percent' as const, value: null };
const nullable = (value: string): string | null => (value.trim() === '' ? null : value);

/** Common terms, offered as a shortcut. "None" leaves the due date unset. */
const TERMS: { label: string; days: number | null }[] = [
  { label: 'No due date', days: null },
  { label: 'Due on receipt', days: 0 },
  { label: 'Net 14', days: 14 },
  { label: 'Net 30', days: 30 },
  { label: 'Net 60', days: 60 },
];

export function InvoiceEditor({ invoice, onChange, onRecordPayment }: Props) {
  const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
  const issues = validateQuote(invoice.quote, invoice.payments, NO_DEPOSIT);
  const currency = invoice.quote.currency;
  const money = (amount: number | null) => formatMoney(amount, currency);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState('');

  const setLine = (id: string, changes: Partial<Invoice['quote']['lineItems'][number]>) =>
    onChange({
      quote: {
        ...invoice.quote,
        lineItems: invoice.quote.lineItems.map((item) =>
          item.id === id ? { ...item, ...changes } : item,
        ),
      },
    });

  return (
    <div className="invoice-editor">
      {issues.length > 0 && (
        <div className="notice" data-tone="error">
          These numbers cannot be trusted until they are fixed:
          <ul>
            {issues.map((issue) => (
              <li key={issue.path}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="section">
        <legend>Invoice</legend>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="inv-number">Invoice number</label>
            <input
              id="inv-number"
              type="text"
              value={invoice.invoiceNumber}
              onChange={(e) => onChange({ invoiceNumber: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="inv-issued">Issue date</label>
            <input
              id="inv-issued"
              type="date"
              value={invoice.issueDate}
              onChange={(e) => onChange({ issueDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="inv-due">Due date</label>
            <input
              id="inv-due"
              type="date"
              value={invoice.dueDate ?? ''}
              onChange={(e) => onChange({ dueDate: nullable(e.target.value) })}
            />
            <span className="hint">Blank means no due date, not due today.</span>
          </div>
        </div>

        <div className="field">
          <label>Payment terms</label>
          <div className="chip-row">
            {TERMS.map((term) => (
              <button
                key={term.label}
                className="btn"
                data-variant="quiet"
                onClick={() =>
                  onChange({
                    dueDate: term.days === null ? null : addDays(invoice.issueDate, term.days),
                  })
                }
              >
                {term.label}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Client</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="inv-client">Name</label>
            <input
              id="inv-client"
              type="text"
              value={invoice.client.name}
              onChange={(e) => onChange({ client: { ...invoice.client, name: e.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="inv-client-email">Email</label>
            <input
              id="inv-client-email"
              type="email"
              value={invoice.client.email ?? ''}
              onChange={(e) =>
                onChange({ client: { ...invoice.client, email: nullable(e.target.value) } })
              }
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="inv-billing">Billing address</label>
          <textarea
            id="inv-billing"
            value={invoice.client.billingAddress ?? ''}
            onChange={(e) =>
              onChange({ client: { ...invoice.client, billingAddress: nullable(e.target.value) } })
            }
          />
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Items</legend>
        <div className="lines-scroll">
          <table className="lines">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 130 }}>Unit price</th>
                <th className="amount" style={{ width: 110 }}>Amount</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {invoice.quote.lineItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="text"
                      aria-label="Description"
                      value={item.description}
                      onChange={(e) => setLine(item.id, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      aria-label="Quantity"
                      min={0}
                      step="any"
                      value={item.quantity}
                      onChange={(e) => setLine(item.id, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      aria-label="Unit price"
                      defaultValue={(item.unitPrice / 100).toFixed(2)}
                      onBlur={(e) => {
                        const parsed = parseMoney(e.target.value);
                        if (parsed !== null) setLine(item.id, { unitPrice: parsed });
                      }}
                    />
                  </td>
                  <td className="amount">{money(lineTotal(item))}</td>
                  <td>
                    <button
                      className="btn"
                      data-variant="quiet"
                      aria-label="Remove line"
                      onClick={() =>
                        onChange({
                          quote: {
                            ...invoice.quote,
                            lineItems: invoice.quote.lineItems.filter((x) => x.id !== item.id),
                          },
                        })
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          className="btn"
          onClick={() =>
            onChange({
              quote: {
                ...invoice.quote,
                lineItems: [
                  ...invoice.quote.lineItems,
                  { id: newId(), kind: 'artwork', description: '', quantity: 1, unitPrice: 0 },
                ],
              },
            })
          }
        >
          Add line
        </button>

        <div className="field" style={{ maxWidth: 220, marginTop: 14 }}>
          <label htmlFor="inv-tax">Tax rate %</label>
          <input
            id="inv-tax"
            type="number"
            min={0}
            max={100}
            step="any"
            value={invoice.quote.taxRatePct ?? ''}
            placeholder="Not applied"
            onChange={(e) =>
              onChange({
                quote: {
                  ...invoice.quote,
                  taxRatePct: e.target.value === '' ? null : Number(e.target.value),
                },
              })
            }
          />
          <span className="hint">Blank means no tax is applied — not a rate of zero.</span>
        </div>

        <div className="totals">
          <div>
            <span>Subtotal</span>
            <span>{money(totals.subtotal)}</span>
          </div>
          <div>
            <span>Tax</span>
            <span>{totals.tax === null ? 'Not applied' : money(totals.tax)}</span>
          </div>
          <div className="grand">
            <span>Total</span>
            <span>{money(totals.total)}</span>
          </div>
          {totals.paid > 0 && (
            <div>
              <span>Paid</span>
              <span>−{money(totals.paid)}</span>
            </div>
          )}
          <div className={totals.credit !== null ? 'credit' : ''}>
            <span>{totals.credit !== null ? 'Credit' : 'Balance due'}</span>
            <span>{money(totals.credit ?? totals.balance)}</span>
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Payments received</legend>
        {invoice.payments.length === 0 && (
          <p className="hint" style={{ marginTop: 0 }}>
            Nothing recorded against this invoice yet.
          </p>
        )}
        <ul className="doc-list">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="doc-row">
              <span className="grow">
                {payment.date}
                {payment.note ? ` — ${payment.note}` : ''}
              </span>
              <span>{money(payment.amount)}</span>
            </li>
          ))}
        </ul>

        <div className="grid-3">
          <div className="field">
            <label htmlFor="pay-date">Date</label>
            <input
              id="pay-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pay-amount">Amount received</label>
            <input
              id="pay-amount"
              type="text"
              placeholder="0.00"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pay-note">Note</label>
            <input
              id="pay-note"
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
            />
          </div>
        </div>
        <button
          className="btn"
          disabled={parseMoney(paymentAmount) === null || (parseMoney(paymentAmount) ?? 0) <= 0}
          onClick={() => {
            const amount = parseMoney(paymentAmount);
            if (amount === null || amount <= 0) return;
            onRecordPayment({ date: paymentDate, amount, note: nullable(paymentNote) });
            setPaymentAmount('');
            setPaymentNote('');
          }}
        >
          Record payment
        </button>
      </fieldset>

      <fieldset className="section">
        <legend>Note to the client</legend>
        <div className="field">
          <textarea
            aria-label="Note to the client"
            value={invoice.note ?? ''}
            onChange={(e) => onChange({ note: nullable(e.target.value) })}
          />
          <span className="hint">Printed above the payment details.</span>
        </div>
      </fieldset>
    </div>
  );
}
