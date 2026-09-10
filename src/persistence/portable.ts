/**
 * Document JSON export and import.
 *
 * An import file is untrusted input. It is validated field by field and
 * refused whole if anything is wrong — a partly-read document would be worse
 * than no document, because the artist would not know which parts are real.
 *
 * Images are NOT included in the JSON. The export says so explicitly, and an
 * imported document lists the image ids it expects so the app can tell the
 * artist which references are missing on this device.
 */

import type { CommissionDocument, LineItem } from '../commission/types';

export const EXPORT_SCHEMA = 'artist-os/commission-document';
export const EXPORT_VERSION = 1;

export interface ExportEnvelope {
  schema: string;
  version: number;
  exportedAt: string;
  /** Stated plainly so nobody assumes the file is a complete backup. */
  imagesIncluded: false;
  referencedImageIds: string[];
  document: CommissionDocument;
}

export function exportDocument(doc: CommissionDocument, now = new Date()): ExportEnvelope {
  const referenced = [...doc.artwork.referenceImageIds];
  if (doc.studio.logoImageId) referenced.push(doc.studio.logoImageId);
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    imagesIncluded: false,
    referencedImageIds: referenced,
    document: structuredClone(doc),
  };
}

export type ImportResult =
  | { ok: true; document: CommissionDocument; missingImageIds: string[] }
  | { ok: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkLineItem(value: unknown, index: number, errors: string[]): void {
  if (!isObject(value)) {
    errors.push(`quote.lineItems[${index}] is not an object.`);
    return;
  }
  if (typeof value.description !== 'string') errors.push(`quote.lineItems[${index}].description must be a string.`);
  if (typeof value.quantity !== 'number' || !Number.isFinite(value.quantity) || value.quantity < 0) {
    errors.push(`quote.lineItems[${index}].quantity must be a number of zero or more.`);
  }
  if (!Number.isInteger(value.unitPrice)) {
    errors.push(`quote.lineItems[${index}].unitPrice must be a whole number of cents.`);
  }
}

/**
 * Validates and accepts a parsed export file. Returns every problem found,
 * rather than the first, so a bad file can be fixed in one pass.
 */
export function importDocument(raw: unknown, availableImageIds: string[] = []): ImportResult {
  const errors: string[] = [];

  if (!isObject(raw)) return { ok: false, errors: ['File is not a JSON object.'] };
  if (raw.schema !== EXPORT_SCHEMA) {
    return { ok: false, errors: [`Unrecognised file. Expected schema "${EXPORT_SCHEMA}".`] };
  }
  if (raw.version !== EXPORT_VERSION) {
    return { ok: false, errors: [`Unsupported export version ${String(raw.version)}. This app reads version ${EXPORT_VERSION}.`] };
  }
  if (!isObject(raw.document)) return { ok: false, errors: ['File contains no document.'] };

  const doc = raw.document;

  if (typeof doc.id !== 'string' || doc.id === '') errors.push('document.id is missing.');
  if (typeof doc.documentNumber !== 'string' || doc.documentNumber === '') errors.push('document.documentNumber is missing.');
  if (typeof doc.title !== 'string') errors.push('document.title must be a string.');
  if (!['draft', 'issued', 'archived'].includes(String(doc.state))) errors.push('document.state is not a known state.');
  if (!Number.isInteger(doc.version)) errors.push('document.version must be a whole number.');

  if (!isObject(doc.quote)) {
    errors.push('document.quote is missing.');
  } else {
    if (typeof doc.quote.currency !== 'string' || doc.quote.currency.length !== 3) {
      errors.push('document.quote.currency must be a three-letter code.');
    }
    if (!Array.isArray(doc.quote.lineItems)) {
      errors.push('document.quote.lineItems must be a list.');
    } else {
      doc.quote.lineItems.forEach((item, i) => checkLineItem(item, i, errors));
    }
    const rate = doc.quote.taxRatePct;
    if (rate !== null && (typeof rate !== 'number' || rate < 0 || rate > 100)) {
      errors.push('document.quote.taxRatePct must be null or a percentage between 0 and 100.');
    }
  }

  if (!Array.isArray(doc.payments)) {
    errors.push('document.payments must be a list.');
  } else {
    doc.payments.forEach((payment, i) => {
      if (!isObject(payment) || !Number.isInteger(payment.amount) || (payment.amount as number) <= 0) {
        errors.push(`document.payments[${i}].amount must be a whole number of cents above zero.`);
      }
    });
  }

  if (!isObject(doc.artwork) || !Array.isArray(doc.artwork.referenceImageIds)) {
    errors.push('document.artwork.referenceImageIds must be a list.');
  }
  if (!Array.isArray(doc.issuedSnapshots)) errors.push('document.issuedSnapshots must be a list.');

  if (errors.length > 0) return { ok: false, errors };

  const imported = doc as unknown as CommissionDocument;
  const referenced = [...imported.artwork.referenceImageIds];
  if (imported.studio.logoImageId) referenced.push(imported.studio.logoImageId);

  return {
    ok: true,
    document: structuredClone(imported),
    missingImageIds: referenced.filter((id) => !availableImageIds.includes(id)),
  };
}

/** Convenience for the file input: parse then validate, never throwing. */
export function importDocumentFromText(text: string, availableImageIds: string[] = []): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'] };
  }
  return importDocument(parsed, availableImageIds);
}

export function lineItemsTotalCount(items: LineItem[]): number {
  return items.length;
}
