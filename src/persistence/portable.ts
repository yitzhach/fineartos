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
import type { ClientUpdate } from '../commission/updates';
import { SHOW_STATUSES, type Show } from '../shows/shows';
import { CATEGORIES, type Expense } from '../finance/ledger';

export const EXPORT_SCHEMA = 'artist-os/commission-document';
export const EXPORT_VERSION = 2;
/**
 * Version 1 files had no client updates. They are still read: a file that was
 * good enough to write is good enough to read back, and refusing one would
 * strand work the artist already exported.
 */
export const READABLE_VERSIONS = [1, 2];

export interface ExportEnvelope {
  schema: string;
  version: number;
  exportedAt: string;
  /** Stated plainly so nobody assumes the file is a complete backup. */
  imagesIncluded: false;
  referencedImageIds: string[];
  document: CommissionDocument;
  /**
   * What the artist told this client. They are the commission's own records
   * and mean nothing apart from it, so they travel with it.
   */
  updates: ClientUpdate[];
}

export function exportDocument(
  doc: CommissionDocument,
  updates: ClientUpdate[] = [],
  now = new Date(),
): ExportEnvelope {
  const referenced = [...doc.artwork.referenceImageIds];
  if (doc.studio.logoImageId) referenced.push(doc.studio.logoImageId);
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    imagesIncluded: false,
    referencedImageIds: referenced,
    document: structuredClone(doc),
    updates: structuredClone(updates.filter((update) => update.documentId === doc.id)),
  };
}

export type ImportResult =
  | {
      ok: true;
      document: CommissionDocument;
      updates: ClientUpdate[];
      missingImageIds: string[];
      /**
       * Pictures an imported update refers to that are not on this device.
       * Photographs are records of their own and never travel in this file.
       */
      missingPhotoIds: string[];
    }
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

function checkUpdate(value: unknown, index: number, documentId: string, errors: string[]): void {
  if (!isObject(value)) {
    errors.push(`updates[${index}] is not an object.`);
    return;
  }
  if (typeof value.id !== 'string' || value.id === '') errors.push(`updates[${index}].id is missing.`);
  if (value.documentId !== documentId) {
    errors.push(`updates[${index}] belongs to another commission.`);
  }
  if (typeof value.headline !== 'string') errors.push(`updates[${index}].headline must be a string.`);
  if (!Array.isArray(value.photoIds)) errors.push(`updates[${index}].photoIds must be a list.`);
  if (!Array.isArray(value.handoffs)) errors.push(`updates[${index}].handoffs must be a list.`);
  if (typeof value.asksApproval !== 'boolean') {
    errors.push(`updates[${index}].asksApproval must be true or false.`);
  }
  // An approval is something that happened or is nothing at all. A half-read
  // one would be the app inventing a reply the client never gave.
  if (value.approval !== null && !isObject(value.approval)) {
    errors.push(`updates[${index}].approval must be a recorded reply or null.`);
  }
}

/**
 * Validates and accepts a parsed export file. Returns every problem found,
 * rather than the first, so a bad file can be fixed in one pass.
 */
export function importDocument(
  raw: unknown,
  availableImageIds: string[] = [],
  availablePhotoIds: string[] = [],
): ImportResult {
  const errors: string[] = [];

  if (!isObject(raw)) return { ok: false, errors: ['File is not a JSON object.'] };
  if (raw.schema !== EXPORT_SCHEMA) {
    return { ok: false, errors: [`Unrecognised file. Expected schema "${EXPORT_SCHEMA}".`] };
  }
  if (!READABLE_VERSIONS.includes(Number(raw.version))) {
    return {
      ok: false,
      errors: [
        `Unsupported export version ${String(raw.version)}. This app reads ${READABLE_VERSIONS.join(' and ')}.`,
      ],
    };
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

  // Absent is fine — a version 1 file has none. Present and wrong is not.
  const rawUpdates = raw.updates === undefined ? [] : raw.updates;
  if (!Array.isArray(rawUpdates)) {
    errors.push('updates must be a list.');
  } else if (typeof doc.id === 'string') {
    rawUpdates.forEach((update, i) => checkUpdate(update, i, doc.id as string, errors));
  }

  if (errors.length > 0) return { ok: false, errors };

  const imported = doc as unknown as CommissionDocument;
  const referenced = [...imported.artwork.referenceImageIds];
  if (imported.studio.logoImageId) referenced.push(imported.studio.logoImageId);

  const updates = structuredClone(rawUpdates as unknown as ClientUpdate[]);
  const wantedPhotos = [...new Set(updates.flatMap((update) => update.photoIds))];

  return {
    ok: true,
    document: structuredClone(imported),
    updates,
    missingImageIds: referenced.filter((id) => !availableImageIds.includes(id)),
    missingPhotoIds: wantedPhotos.filter((id) => !availablePhotoIds.includes(id)),
  };
}

/** Convenience for the file input: parse then validate, never throwing. */
export function importDocumentFromText(
  text: string,
  availableImageIds: string[] = [],
  availablePhotoIds: string[] = [],
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'] };
  }
  return importDocument(parsed, availableImageIds, availablePhotoIds);
}

export function lineItemsTotalCount(items: LineItem[]): number {
  return items.length;
}


// --- The books ------------------------------------------------------------

export const EXPENSES_SCHEMA = 'artist-os/expenses';
export const EXPENSES_VERSION = 1;

/**
 * The books as a file that can be read back in.
 *
 * The CSV on the same screen is for the accountant and is a one-way door: it
 * rounds, it flattens and nothing imports it back. This is the other half —
 * the rows exactly as they were written, so a year's books can move to
 * another device without being retyped.
 *
 * Receipt photographs are not in it, for the same reason the commission file
 * carries no images: a year of receipts is tens of megabytes. The file lists
 * the ids it expects, and the import says which ones are not on this device.
 */
export interface ExpensesEnvelope {
  schema: string;
  version: number;
  exportedAt: string;
  imagesIncluded: false;
  referencedImageIds: string[];
  expenses: Expense[];
}

export function exportExpenses(expenses: Expense[], now = new Date()): ExpensesEnvelope {
  return {
    schema: EXPENSES_SCHEMA,
    version: EXPENSES_VERSION,
    exportedAt: now.toISOString(),
    imagesIncluded: false,
    referencedImageIds: [...new Set(expenses.flatMap((expense) => expense.receiptImageIds))],
    expenses: structuredClone(expenses),
  };
}

export type ExpensesImportResult =
  | { ok: true; expenses: Expense[]; missingImageIds: string[] }
  | { ok: false; errors: string[] };

const CATEGORY_IDS = CATEGORIES.map((category) => category.id as string);

function checkExpense(value: unknown, index: number, errors: string[]): void {
  if (!isObject(value)) {
    errors.push(`expenses[${index}] is not an object.`);
    return;
  }
  if (typeof value.id !== 'string' || value.id === '') errors.push(`expenses[${index}].id is missing.`);
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    errors.push(`expenses[${index}].date must be yyyy-mm-dd.`);
  }
  if (!CATEGORY_IDS.includes(String(value.category))) {
    errors.push(`expenses[${index}].category is not one this app knows.`);
  }
  if (typeof value.what !== 'string') errors.push(`expenses[${index}].what must be a string.`);
  // Null is the whole point: an amount nobody recorded is not zero, and an
  // import that quietly made it zero would put a wrong number in the books.
  if (value.amount !== null && !Number.isInteger(value.amount)) {
    errors.push(`expenses[${index}].amount must be null or a whole number of cents.`);
  }
  if (value.miles !== null && (typeof value.miles !== 'number' || !Number.isFinite(value.miles))) {
    errors.push(`expenses[${index}].miles must be null or a number.`);
  }
  if (value.ratePerMile !== null && !Number.isInteger(value.ratePerMile)) {
    errors.push(`expenses[${index}].ratePerMile must be null or a whole number of cents.`);
  }
  if (!Array.isArray(value.receiptImageIds)) {
    errors.push(`expenses[${index}].receiptImageIds must be a list.`);
  }
}

export function importExpenses(raw: unknown, availableImageIds: string[] = []): ExpensesImportResult {
  if (!isObject(raw)) return { ok: false, errors: ['File is not a JSON object.'] };
  if (raw.schema !== EXPENSES_SCHEMA) {
    return { ok: false, errors: [`Unrecognised file. Expected schema "${EXPENSES_SCHEMA}".`] };
  }
  if (Number(raw.version) !== EXPENSES_VERSION) {
    return {
      ok: false,
      errors: [
        `Unsupported export version ${String(raw.version)}. This app reads version ${EXPENSES_VERSION}.`,
      ],
    };
  }
  if (!Array.isArray(raw.expenses)) return { ok: false, errors: ['File contains no rows.'] };

  const errors: string[] = [];
  raw.expenses.forEach((expense, i) => checkExpense(expense, i, errors));
  if (errors.length > 0) return { ok: false, errors };

  const expenses = structuredClone(raw.expenses as unknown as Expense[]);
  const wanted = [...new Set(expenses.flatMap((expense) => expense.receiptImageIds))];
  return {
    ok: true,
    expenses,
    missingImageIds: wanted.filter((id) => !availableImageIds.includes(id)),
  };
}

export function importExpensesFromText(
  text: string,
  availableImageIds: string[] = [],
): ExpensesImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'] };
  }
  return importExpenses(parsed, availableImageIds);
}

/**
 * Rows already in the studio. An import never writes over a row that is
 * already there: the same file read twice must not double the books.
 */
export function newExpenses(incoming: Expense[], existing: Expense[]): Expense[] {
  const here = new Set(existing.map((expense) => expense.id));
  return incoming.filter((expense) => !here.has(expense.id));
}

// --- Shows ------------------------------------------------------------------

export const SHOWS_SCHEMA = 'artist-os/shows';
export const SHOWS_VERSION = 1;

/**
 * Shows as a file that reads back in. The pieces are named by id only — the
 * pictures themselves are not in it — and booth fees travel in the books
 * file; an accepted show writes its fee row again on import if it is missing.
 */
export interface ShowsEnvelope {
  schema: string;
  version: number;
  exportedAt: string;
  shows: Show[];
}

export function exportShows(shows: Show[], now = new Date()): ShowsEnvelope {
  return { schema: SHOWS_SCHEMA, version: SHOWS_VERSION, exportedAt: now.toISOString(), shows: structuredClone(shows) };
}

export type ShowsImportResult =
  | { ok: true; shows: Show[]; missingPieceIds: string[] }
  | { ok: false; errors: string[] };

const DATE_OR_NULL = (value: unknown) => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
const STATUS_IDS = SHOW_STATUSES.map((status) => status.id as string);

function checkShow(value: unknown, index: number, errors: string[]): void {
  if (!isObject(value)) {
    errors.push(`shows[${index}] is not an object.`);
    return;
  }
  if (typeof value.id !== 'string' || value.id === '') errors.push(`shows[${index}].id is missing.`);
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push(`shows[${index}].name is missing.`);
  for (const key of ['startDate', 'endDate', 'deadline'] as const) {
    if (!DATE_OR_NULL(value[key])) errors.push(`shows[${index}].${key} must be yyyy-mm-dd or null.`);
  }
  if (value.boothFee !== null && !Number.isInteger(value.boothFee)) {
    errors.push(`shows[${index}].boothFee must be null or a whole number of cents.`);
  }
  if (value.status !== null && !STATUS_IDS.includes(String(value.status))) {
    errors.push(`shows[${index}].status is not one this app knows.`);
  }
  if (!Array.isArray(value.pieceIds)) errors.push(`shows[${index}].pieceIds must be a list.`);
  if (!isObject(value.priorLocations)) errors.push(`shows[${index}].priorLocations must be an object.`);
}

export function importShowsFromText(text: string, availablePieceIds: string[] = []): ShowsImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'] };
  }
  if (!isObject(raw)) return { ok: false, errors: ['File is not a JSON object.'] };
  if (raw.schema !== SHOWS_SCHEMA) {
    return { ok: false, errors: [`Unrecognised file. Expected schema "${SHOWS_SCHEMA}".`] };
  }
  if (Number(raw.version) !== SHOWS_VERSION) {
    return { ok: false, errors: [`Unsupported export version ${String(raw.version)}. This app reads version ${SHOWS_VERSION}.`] };
  }
  if (!Array.isArray(raw.shows)) return { ok: false, errors: ['File contains no shows.'] };
  const errors: string[] = [];
  raw.shows.forEach((show, i) => checkShow(show, i, errors));
  if (errors.length > 0) return { ok: false, errors };
  const shows = structuredClone(raw.shows as unknown as Show[]);
  const wanted = [...new Set(shows.flatMap((show) => show.pieceIds))];
  return { ok: true, shows, missingPieceIds: wanted.filter((id) => !availablePieceIds.includes(id)) };
}

/** Shows not already here. The same file read twice adds nothing. */
export function newShows(incoming: Show[], existing: Show[]): Show[] {
  const here = new Set(existing.map((show) => show.id));
  return incoming.filter((show) => !here.has(show.id));
}
