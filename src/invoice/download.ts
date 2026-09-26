/**
 * Turning a rendered invoice into a file on the artist's machine.
 *
 * Everything here is local: a blob is built in the page and handed to the
 * browser's download. Nothing is uploaded, and no service sees the invoice.
 * Emailing it is the artist's own mail client, with the file attached or the
 * HTML pasted in — see FUTURE_BUILD.md for what sending from inside the app
 * would require.
 */

import { calculateTotals } from '../commission/calc';
import { drawInvoice, renderInvoiceHtml } from './render';
import { invoiceFileStem } from './invoice';
import type { Invoice } from './types';

const NO_DEPOSIT = { kind: 'percent' as const, value: null };

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoked on the next tick: revoking immediately can cancel the download
  // in some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads an image blob as a data: URI so it can be inlined into the HTML. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * One self-contained .html file. This is the one to paste into an email: it
 * carries its own styles and its own images and needs nothing from this app.
 */
export function downloadInvoiceHtml(invoice: Invoice, logoDataUrl: string | null): void {
  const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
  const html = renderInvoiceHtml(invoice, totals, { logoDataUrl });
  triggerDownload(new Blob([html], { type: 'text/html' }), `${invoiceFileStem(invoice)}.html`);
}

/** The same HTML on the clipboard, for pasting straight into a mail window. */
export async function copyInvoiceHtml(invoice: Invoice, logoDataUrl: string | null): Promise<void> {
  const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
  const html = renderInvoiceHtml(invoice, totals, { logoDataUrl });

  // The rich-text flavour is what a mail composer pastes as a formatted
  // invoice; the plain flavour is the fallback for anything that cannot.
  if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([html], { type: 'text/plain' }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(html);
}

export type RasterFormat = 'jpeg' | 'png';

/**
 * A JPEG or PNG of the invoice, drawn from the model onto a canvas.
 *
 * Resolves once the file has been handed to the browser. A canvas that cannot
 * produce a blob throws rather than silently downloading nothing.
 */
export function downloadInvoiceImage(invoice: Invoice, format: RasterFormat = 'jpeg'): Promise<void> {
  const totals = calculateTotals(invoice.quote, invoice.payments, NO_DEPOSIT);
  const canvas = document.createElement('canvas');
  drawInvoice(canvas, invoice, totals, 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('This browser could not produce an image from the invoice.'));
          return;
        }
        triggerDownload(blob, `${invoiceFileStem(invoice)}.${format === 'jpeg' ? 'jpg' : 'png'}`);
        resolve();
      },
      format === 'jpeg' ? 'image/jpeg' : 'image/png',
      format === 'jpeg' ? 0.92 : undefined,
    );
  });
}

export { mailtoForInvoice } from './mailto';
