import type { Invoice } from './types';

/**
 * Opens the artist's mail client with the client's address and a subject
 * filled in. The invoice itself is not attached: a mailto: link cannot carry
 * an attachment, and pretending otherwise would send an empty email. The UI
 * saves the file first and says to attach it.
 */
export function mailtoForInvoice(invoice: Invoice): string {
  const to = invoice.client.email ?? '';
  const subject = `Invoice ${invoice.invoiceNumber}${
    invoice.studio.name ? ` from ${invoice.studio.name}` : ''
  }`;
  const body = [
    invoice.client.name ? `Hi ${invoice.client.name.split(/\s+/)[0]},` : 'Hi,',
    '',
    `Please find invoice ${invoice.invoiceNumber} attached.`,
    invoice.dueDate ? `It is due on ${invoice.dueDate}.` : '',
    '',
    'Thank you,',
    invoice.studio.name || '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
