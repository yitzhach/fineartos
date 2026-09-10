/**
 * Invoice output: one self-contained HTML file, and a canvas drawing used for
 * JPEG and PNG.
 *
 * Both render from the model, not from the screen. That means an export cannot
 * accidentally capture app chrome, a hover state, or a half-scrolled window,
 * and both can be tested without a browser layout.
 *
 * Every figure comes in as a `Totals` from calc.ts. Nothing here does money
 * arithmetic of its own, so an export cannot disagree with the editor.
 */

import { formatMoney } from '../commission/calc';
import type { Totals } from '../commission/calc';
import type { Invoice } from './types';
import { hasAnyPaymentMethod, type PaymentInstructions } from '../lib/prefs';

/** Escapes text for HTML. Applied to every value that reaches the output. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** yyyy-mm-dd to "12 March 2026", without pulling in a date library. */
export function formatDate(iso: string | null): string {
  if (!iso) return 'Not set';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export interface PaymentLine {
  label: string;
  value: string;
}

/**
 * The payment methods the artist actually filled in, in the order they should
 * be read. A method left blank is simply absent — the invoice never prints an
 * empty "Venmo:" line inviting the client to wonder.
 */
export function paymentLines(p: PaymentInstructions): PaymentLine[] {
  const candidates: PaymentLine[] = [
    { label: 'Pay online', value: p.squareLink ?? '' },
    { label: 'PayPal', value: p.paypal ?? '' },
    { label: 'Venmo', value: p.venmo ?? '' },
    { label: 'Zelle', value: p.zelle ?? '' },
    { label: 'Check payable to', value: p.checkPayableTo ?? '' },
    { label: 'Bank transfer', value: p.bankDetails ?? '' },
  ];
  return candidates
    .map((line) => ({ ...line, value: line.value.trim() }))
    .filter((line) => line.value !== '');
}

export interface HtmlOptions {
  /**
   * The studio logo as a data: URI. A URL pointing at this app would break the
   * moment the file is emailed, so only an inlined image is accepted.
   */
  logoDataUrl?: string | null;
}

/**
 * Builds one HTML file with no external references at all: styles inlined,
 * images inlined as data URIs, no script, no font fetch. It can be saved,
 * attached, or pasted straight into an email body and still look right.
 */
export function renderInvoiceHtml(invoice: Invoice, totals: Totals, options: HtmlOptions = {}): string {
  const currency = invoice.quote.currency;
  const money = (amount: number | null) => escapeHtml(formatMoney(amount, currency));
  const text = (value: string | null, fallback = '') => escapeHtml((value ?? '').trim() || fallback);

  const rows = invoice.quote.lineItems
    .map((item) => {
      const amount = Math.sign(item.quantity * item.unitPrice) * Math.round(Math.abs(item.quantity * item.unitPrice));
      return `
        <tr>
          <td>${text(item.description, 'Untitled item')}</td>
          <td class="num">${escapeHtml(String(item.quantity))}</td>
          <td class="num">${money(item.unitPrice)}</td>
          <td class="num">${money(amount)}</td>
        </tr>`;
    })
    .join('');

  const paid = invoice.payments
    .map(
      (payment) => `
        <tr>
          <td>${escapeHtml(formatDate(payment.date))}${payment.note ? ` — ${text(payment.note)}` : ''}</td>
          <td class="num">${money(payment.amount)}</td>
        </tr>`,
    )
    .join('');

  const methods = paymentLines(invoice.paymentInstructions);
  const paymentBlock = hasAnyPaymentMethod(invoice.paymentInstructions)
    ? `
      <section class="pay">
        <h2>How to pay</h2>
        <dl>
          ${methods
            .map(
              (line) => `<div><dt>${escapeHtml(line.label)}</dt><dd>${escapeHtml(line.value)}</dd></div>`,
            )
            .join('')}
        </dl>
        ${
          invoice.paymentInstructions.terms
            ? `<p class="terms">${text(invoice.paymentInstructions.terms)}</p>`
            : ''
        }
      </section>`
    : `
      <section class="pay">
        <h2>How to pay</h2>
        <p class="terms">No payment details have been set for this studio yet.</p>
      </section>`;

  const logo = options.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(options.logoDataUrl)}" alt="" />`
    : '';

  // Styles are inline and deliberately plain: email clients strip most of a
  // stylesheet, so this leans on what survives — tables, borders, basic type.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${text(invoice.invoiceNumber)}</title>
<style>
  body { margin: 0; padding: 32px; background: #f4f1ec; color: #23201c;
         font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fffdf9; padding: 44px 48px;
           border: 1px solid #e0d8cb; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-weight: normal; font-size: 27px; margin: 0 0 2px; }
  h2 { font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase; color: #7d7466;
       margin: 26px 0 8px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start;
          border-bottom: 2px solid #23201c; padding-bottom: 18px; }
  .logo { max-height: 56px; max-width: 190px; display: block; margin-bottom: 8px; }
  .meta { text-align: right; font-size: 13px; color: #554f46; white-space: nowrap; }
  .meta strong { color: #23201c; }
  .parties { display: flex; gap: 40px; margin-top: 22px; }
  .parties > div { flex: 1; }
  .parties p { margin: 0; line-height: 1.55; white-space: pre-line; color: #554f46; }
  .parties .who { color: #23201c; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
       color: #7d7466; border-bottom: 1px solid #ddd4c6; padding: 0 0 7px; font-weight: 600; }
  td { padding: 10px 0; border-bottom: 1px solid #efe9df; vertical-align: top; line-height: 1.5; }
  .num { text-align: right; white-space: nowrap; }
  .totals { width: 300px; margin-left: auto; margin-top: 14px; }
  .totals td { border: 0; padding: 5px 0; }
  .totals .grand td { border-top: 2px solid #23201c; font-size: 17px; padding-top: 11px;
                      font-family: Georgia, serif; }
  .totals .due td { font-weight: 700; }
  .pay { margin-top: 30px; border-top: 1px solid #ddd4c6; padding-top: 6px; }
  .pay dl { margin: 0; }
  .pay dl > div { display: flex; gap: 12px; padding: 4px 0; }
  .pay dt { width: 130px; flex: 0 0 130px; color: #7d7466; font-size: 13px; }
  .pay dd { margin: 0; word-break: break-word; }
  .terms { color: #554f46; line-height: 1.6; margin: 10px 0 0; white-space: pre-line; }
  .note { margin-top: 24px; line-height: 1.6; white-space: pre-line; color: #554f46; }
  .foot { margin-top: 30px; padding-top: 14px; border-top: 1px solid #efe9df;
          font-size: 12px; color: #8a8072; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        ${logo}
        <h1>${text(invoice.studio.name, 'Studio name not set')}</h1>
        <p class="meta" style="text-align:left">${text(invoice.studio.email)}${
          invoice.studio.phone ? ` · ${text(invoice.studio.phone)}` : ''
        }</p>
      </div>
      <div class="meta">
        <div style="font-size:19px;font-family:Georgia,serif">Invoice</div>
        <div><strong>${text(invoice.invoiceNumber)}</strong></div>
        <div>Issued ${escapeHtml(formatDate(invoice.issueDate))}</div>
        <div>${invoice.dueDate ? `Due ${escapeHtml(formatDate(invoice.dueDate))}` : 'No due date set'}</div>
      </div>
    </div>

    <div class="parties">
      <div>
        <h2>Billed to</h2>
        <p class="who">${text(invoice.client.name, 'Client name not set')}</p>
        <p>${text(invoice.client.billingAddress)}</p>
        <p>${text(invoice.client.email)}</p>
      </div>
      <div>
        <h2>From</h2>
        <p class="who">${text(invoice.studio.name, 'Studio name not set')}</p>
        <p>${text(invoice.studio.address)}</p>
      </div>
    </div>

    <h2>Items</h2>
    <table>
      <thead>
        <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals">
      <tbody>
        <tr><td>Subtotal</td><td class="num">${money(totals.subtotal)}</td></tr>
        <tr><td>Tax${
          invoice.quote.taxRatePct !== null ? ` (${escapeHtml(String(invoice.quote.taxRatePct))}%)` : ''
        }</td><td class="num">${
          totals.tax === null ? 'Not applied' : money(totals.tax)
        }</td></tr>
        <tr class="grand"><td>Total</td><td class="num">${money(totals.total)}</td></tr>
        ${totals.paid > 0 ? `<tr><td>Paid</td><td class="num">−${money(totals.paid)}</td></tr>` : ''}
        ${
          totals.credit !== null
            ? `<tr class="due"><td>Credit</td><td class="num">${money(totals.credit)}</td></tr>`
            : `<tr class="due"><td>Balance due</td><td class="num">${money(totals.balance)}</td></tr>`
        }
      </tbody>
    </table>

    ${paid ? `<h2>Payments received</h2><table><tbody>${paid}</tbody></table>` : ''}
    ${invoice.note ? `<p class="note">${text(invoice.note)}</p>` : ''}
    ${paymentBlock}

    <p class="foot">${
      invoice.sourceDocumentNumber
        ? `For commission ${escapeHtml(invoice.sourceDocumentNumber)}.`
        : ''
    } Thank you.</p>
  </div>
</body>
</html>`;
}

// --- Canvas drawing -------------------------------------------------------

/**
 * Draws the invoice onto a 2D canvas at `scale` device pixels per CSS pixel,
 * for JPEG and PNG export.
 *
 * This is a second renderer rather than a screenshot of the first because
 * rasterising live DOM is unreliable across browsers, and because a drawing
 * made from the model cannot capture something that was only on screen. The
 * two renderers are kept close in layout, but the HTML file is the one to
 * send when fidelity matters.
 */
export function drawInvoice(
  canvas: HTMLCanvasElement,
  invoice: Invoice,
  totals: Totals,
  scale = 2,
): void {
  const W = 760;
  const PAD = 48;
  const currency = invoice.quote.currency;
  const money = (amount: number | null) => formatMoney(amount, currency);

  // Measure first so the canvas is exactly as tall as the content.
  const lineRows = invoice.quote.lineItems.length;
  const methods = paymentLines(invoice.paymentInstructions);
  const height =
    250 +
    lineRows * 30 +
    150 +
    (invoice.payments.length ? 30 + invoice.payments.length * 22 : 0) +
    (invoice.note ? 60 : 0) +
    (methods.length ? 40 + methods.length * 22 : 40) +
    60;

  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser did not provide a 2D canvas context.');
  ctx.scale(scale, scale);

  const SERIF = 'Georgia, "Times New Roman", serif';
  const SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const INK = '#23201c';
  const SOFT = '#554f46';
  const FAINT = '#7d7466';

  ctx.fillStyle = '#fffdf9';
  ctx.fillRect(0, 0, W, height);

  const right = W - PAD;
  let y = PAD + 10;

  const label = (value: string, x: number, yy: number) => {
    ctx.font = `600 10px ${SANS}`;
    ctx.fillStyle = FAINT;
    ctx.textAlign = 'left';
    ctx.fillText(value.toUpperCase(), x, yy);
  };
  const rightText = (value: string, yy: number, font: string, color: string) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.fillText(value, right, yy);
    ctx.textAlign = 'left';
  };

  // Header
  ctx.font = `26px ${SERIF}`;
  ctx.fillStyle = INK;
  ctx.fillText(invoice.studio.name.trim() || 'Studio name not set', PAD, y);
  rightText('Invoice', y, `19px ${SERIF}`, INK);
  y += 20;
  ctx.font = `12px ${SANS}`;
  ctx.fillStyle = SOFT;
  const contact = [invoice.studio.email, invoice.studio.phone].filter(Boolean).join(' · ');
  if (contact) ctx.fillText(contact, PAD, y);
  rightText(invoice.invoiceNumber, y, `600 12px ${SANS}`, INK);
  y += 16;
  rightText(`Issued ${formatDate(invoice.issueDate)}`, y, `12px ${SANS}`, SOFT);
  y += 16;
  rightText(
    invoice.dueDate ? `Due ${formatDate(invoice.dueDate)}` : 'No due date set',
    y,
    `12px ${SANS}`,
    SOFT,
  );

  y += 14;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  // Parties
  y += 26;
  label('Billed to', PAD, y);
  label('From', PAD + 330, y);
  y += 17;
  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(invoice.client.name.trim() || 'Client name not set', PAD, y);
  ctx.fillText(invoice.studio.name.trim() || '—', PAD + 330, y);
  y += 16;
  ctx.font = `12px ${SANS}`;
  ctx.fillStyle = SOFT;
  if (invoice.client.email) ctx.fillText(invoice.client.email, PAD, y);
  y += 26;

  // Items
  label('Description', PAD, y);
  ctx.textAlign = 'right';
  ctx.font = `600 10px ${SANS}`;
  ctx.fillStyle = FAINT;
  ctx.fillText('AMOUNT', right, y);
  ctx.fillText('UNIT', right - 90, y);
  ctx.fillText('QTY', right - 180, y);
  ctx.textAlign = 'left';
  y += 8;
  ctx.strokeStyle = '#ddd4c6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  for (const item of invoice.quote.lineItems) {
    y += 21;
    const amount =
      Math.sign(item.quantity * item.unitPrice) * Math.round(Math.abs(item.quantity * item.unitPrice));
    ctx.font = `13px ${SANS}`;
    ctx.fillStyle = INK;
    const description = item.description.trim() || 'Untitled item';
    // Truncate rather than overlap the numbers, and say so with an ellipsis.
    let shown = description;
    while (ctx.measureText(shown).width > right - PAD - 200 && shown.length > 1) {
      shown = shown.slice(0, -1);
    }
    ctx.fillText(shown === description ? description : `${shown.trimEnd()}…`, PAD, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = SOFT;
    ctx.fillText(String(item.quantity), right - 180, y);
    ctx.fillText(money(item.unitPrice), right - 90, y);
    ctx.fillStyle = INK;
    ctx.fillText(money(amount), right, y);
    ctx.textAlign = 'left';
    y += 9;
    ctx.strokeStyle = '#efe9df';
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // Totals
  const totalsLeft = right - 250;
  const totalRow = (name: string, value: string, bold = false) => {
    y += 20;
    ctx.font = `${bold ? '600 ' : ''}13px ${SANS}`;
    ctx.fillStyle = bold ? INK : SOFT;
    ctx.fillText(name, totalsLeft, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.fillText(value, right, y);
    ctx.textAlign = 'left';
  };

  y += 6;
  totalRow('Subtotal', money(totals.subtotal));
  totalRow(
    invoice.quote.taxRatePct !== null ? `Tax (${invoice.quote.taxRatePct}%)` : 'Tax',
    totals.tax === null ? 'Not applied' : money(totals.tax),
  );
  y += 12;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(totalsLeft, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  y += 4;
  ctx.font = `16px ${SERIF}`;
  y += 20;
  ctx.fillStyle = INK;
  ctx.fillText('Total', totalsLeft, y);
  ctx.textAlign = 'right';
  ctx.fillText(money(totals.total), right, y);
  ctx.textAlign = 'left';
  if (totals.paid > 0) totalRow('Paid', `−${money(totals.paid)}`);
  if (totals.credit !== null) totalRow('Credit', money(totals.credit), true);
  else totalRow('Balance due', money(totals.balance), true);

  // Note
  y += 30;
  if (invoice.note) {
    ctx.font = `12px ${SANS}`;
    ctx.fillStyle = SOFT;
    wrapText(ctx, invoice.note, PAD, y, W - PAD * 2, 17);
    y += 40;
  }

  // How to pay
  ctx.strokeStyle = '#ddd4c6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  y += 20;
  label('How to pay', PAD, y);
  y += 6;
  if (methods.length === 0) {
    y += 16;
    ctx.font = `12px ${SANS}`;
    ctx.fillStyle = SOFT;
    ctx.fillText('No payment details have been set for this studio yet.', PAD, y);
  } else {
    for (const method of methods) {
      y += 19;
      ctx.font = `12px ${SANS}`;
      ctx.fillStyle = FAINT;
      ctx.fillText(method.label, PAD, y);
      ctx.fillStyle = INK;
      ctx.fillText(method.value, PAD + 130, y);
    }
  }
}

/** Draws wrapped text and returns the y it finished at. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  let line = '';
  let cursor = y;
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      cursor += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
  return cursor;
}
