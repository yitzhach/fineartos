import { describe, expect, it } from 'vitest';
import { calculateTotals } from '../../commission/calc';
import { emptyPaymentInstructions, type PaymentInstructions } from '../../lib/prefs';
import { createBlankInvoice } from '../invoice';
import { escapeHtml, formatDate, paymentLines, renderInvoiceHtml } from '../render';
import type { Invoice } from '../types';

const noDeposit = { kind: 'percent' as const, value: null };

function invoiceWith(overrides: Partial<Invoice> = {}): Invoice {
  const base = createBlankInvoice('INV-2026-0001', emptyPaymentInstructions());
  return {
    ...base,
    studio: { ...base.studio, name: 'Ada Studio', email: 'ada@example.com' },
    client: { ...base.client, name: 'Grace Hopper', email: 'grace@example.com' },
    quote: {
      currency: 'USD',
      taxRatePct: null,
      lineItems: [
        { id: '1', kind: 'artwork', description: 'Oil on linen, 30×40', quantity: 1, unitPrice: 250000 },
      ],
    },
    ...overrides,
  };
}

function render(invoice: Invoice): string {
  return renderInvoiceHtml(invoice, calculateTotals(invoice.quote, invoice.payments, noDeposit));
}

describe('escapeHtml', () => {
  it('escapes every character that could change the markup', () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe(
      '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;',
    );
  });
});

describe('formatDate', () => {
  it('reads a date as a person would', () => {
    expect(formatDate('2026-03-12')).toBe('March 12, 2026');
  });

  it('says a missing date is not set rather than inventing today', () => {
    expect(formatDate(null)).toBe('Not set');
  });
});

describe('paymentLines', () => {
  it('lists only the methods that were actually filled in', () => {
    const p: PaymentInstructions = { ...emptyPaymentInstructions(), venmo: '@ada', zelle: '   ' };
    expect(paymentLines(p)).toEqual([{ label: 'Venmo', value: '@ada' }]);
  });

  it('is empty when nothing is set', () => {
    expect(paymentLines(emptyPaymentInstructions())).toEqual([]);
  });
});

describe('renderInvoiceHtml', () => {
  it('produces a file with no external references at all', () => {
    const html = render(invoiceWith());
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link/i);
  });

  it('shows the client and the amount', () => {
    const html = render(invoiceWith());
    expect(html).toContain('Grace Hopper');
    expect(html).toContain('$2,500.00');
  });

  it('says tax was not applied rather than printing $0.00', () => {
    const html = render(invoiceWith());
    expect(html).toContain('Not applied');
    expect(html).not.toContain('Tax (');
  });

  it('prints the tax line when a rate is set', () => {
    const invoice = invoiceWith();
    const html = render({ ...invoice, quote: { ...invoice.quote, taxRatePct: 8.25 } });
    expect(html).toContain('Tax (8.25%)');
    expect(html).toContain('$206.25');
  });

  it('escapes text rather than letting it become markup', () => {
    const invoice = invoiceWith();
    const html = render({
      ...invoice,
      client: { ...invoice.client, name: '<script>alert(1)</script>' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('says plainly when no payment details have been set', () => {
    expect(render(invoiceWith())).toContain('No payment details have been set');
  });

  it('prints the payment methods the artist set', () => {
    const invoice = invoiceWith({
      paymentInstructions: {
        ...emptyPaymentInstructions(),
        squareLink: 'https://square.link/u/abc',
        venmo: '@ada-studio',
      },
    });
    const html = renderInvoiceHtml(
      invoice,
      calculateTotals(invoice.quote, invoice.payments, noDeposit),
    );
    expect(html).toContain('square.link/u/abc');
    expect(html).toContain('@ada-studio');
    expect(html).toContain('Pay online');
  });

  it('shows a balance due, and a credit instead when the client overpaid', () => {
    const invoice = invoiceWith();
    const paidInFull = {
      ...invoice,
      payments: [{ id: 'p1', date: '2026-03-01', amount: 300000, note: null }],
    };
    const html = render(paidInFull);
    expect(html).toContain('Credit');
    expect(html).not.toContain('Balance due');
  });

  it('says there is no due date rather than showing a blank', () => {
    expect(render(invoiceWith())).toContain('No due date set');
  });

  it('only embeds a logo when one is given as an inlined image', () => {
    const invoice = invoiceWith();
    const totals = calculateTotals(invoice.quote, invoice.payments, noDeposit);
    expect(renderInvoiceHtml(invoice, totals)).not.toContain('<img');
    expect(renderInvoiceHtml(invoice, totals, { logoDataUrl: 'data:image/png;base64,AAA' })).toContain(
      'data:image/png;base64,AAA',
    );
  });

  it('names the commission it came from', () => {
    const html = render(invoiceWith({ sourceDocumentNumber: 'AO-2026-0007' }));
    expect(html).toContain('AO-2026-0007');
  });
});
