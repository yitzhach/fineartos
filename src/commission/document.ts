/**
 * Document lifecycle: create, duplicate, issue, revise.
 *
 * The rules that matter here:
 *  - Duplicating gives a new number and drops payments and issued history.
 *  - Issuing freezes a client-facing copy; later edits make a new draft
 *    revision and never touch that frozen copy.
 *  - Private notes are stripped on the way into any snapshot or export.
 */

import type {
  ClientFacing,
  CommissionDocument,
  IssuedSnapshot,
  LineItem,
  Payment,
} from './types';

export function newId(): string {
  // crypto.randomUUID is available in every browser we target and in Node 22.
  return crypto.randomUUID();
}

/** Document numbers are stable, sortable and readable: AO-2026-0007. */
export function nextDocumentNumber(existingNumbers: string[], year: number): string {
  const prefix = `AO-${year}-`;
  const highest = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number.parseInt(n.slice(prefix.length), 10))
    .filter((n) => Number.isInteger(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}

export function emptyLineItem(kind: LineItem['kind'] = 'artwork'): LineItem {
  return { id: newId(), kind, description: '', quantity: 1, unitPrice: 0 };
}

export function createDocument(documentNumber: string, now = new Date()): CommissionDocument {
  const iso = now.toISOString();
  return {
    id: newId(),
    documentNumber,
    title: '',
    createdDate: iso.slice(0, 10),
    state: 'draft',
    version: 1,
    studio: { name: '', email: null, phone: null, address: null, logoImageId: null },
    client: { name: '', email: null, phone: null, billingAddress: null, projectAddress: null, source: null },
    artwork: {
      description: '',
      width: null,
      height: null,
      depth: null,
      unit: 'in',
      materials: null,
      finish: null,
      referenceImageIds: [],
    },
    schedule: { targetCompletionDate: null, deliveryNotes: null },
    quote: { currency: 'USD', lineItems: [emptyLineItem()], taxRatePct: null },
    deposit: { kind: 'percent', value: null },
    payments: [],
    terms: { body: null, revisionAllowance: null, cancellation: null },
    privateNotes: null,
    issuedSnapshots: [],
    createdAt: iso,
    updatedAt: iso,
    isDemo: false,
  };
}

/**
 * Strips a document down to what a client may see. Anything added to
 * CommissionDocument but not listed here simply never reaches the client.
 */
export function toClientFacing(doc: CommissionDocument): ClientFacing {
  return structuredClone({
    studio: doc.studio,
    documentNumber: doc.documentNumber,
    title: doc.title,
    createdDate: doc.createdDate,
    client: doc.client,
    artwork: doc.artwork,
    schedule: doc.schedule,
    quote: doc.quote,
    deposit: doc.deposit,
    payments: doc.payments,
    terms: doc.terms,
  });
}

/**
 * A duplicate is a fresh commission that happens to start from the same
 * details: new id, new number, no money received, no issued history.
 */
export function duplicateDocument(
  source: CommissionDocument,
  documentNumber: string,
  now = new Date(),
): CommissionDocument {
  const iso = now.toISOString();
  const copy = structuredClone(source);
  return {
    ...copy,
    id: newId(),
    documentNumber,
    title: copy.title ? `${copy.title} (copy)` : '',
    state: 'draft',
    version: 1,
    payments: [],
    issuedSnapshots: [],
    createdDate: iso.slice(0, 10),
    createdAt: iso,
    updatedAt: iso,
    isDemo: false,
    quote: { ...copy.quote, lineItems: copy.quote.lineItems.map((item) => ({ ...item, id: newId() })) },
  };
}

/** Freezes the current client-facing document as an immutable snapshot. */
export function issueDocument(doc: CommissionDocument, now = new Date()): CommissionDocument {
  const iso = now.toISOString();
  const snapshot: IssuedSnapshot = {
    version: doc.version,
    issuedAt: iso,
    document: toClientFacing(doc),
  };
  return {
    ...doc,
    state: 'issued',
    issuedSnapshots: [...doc.issuedSnapshots, snapshot],
    updatedAt: iso,
  };
}

/**
 * Applies an edit. Editing an issued document starts a new draft revision
 * rather than changing what the client was already given.
 */
export function applyEdit(
  doc: CommissionDocument,
  changes: Partial<CommissionDocument>,
  now = new Date(),
): CommissionDocument {
  const wasIssued = doc.state === 'issued';
  return {
    ...doc,
    ...changes,
    id: doc.id,
    issuedSnapshots: doc.issuedSnapshots,
    version: wasIssued ? doc.version + 1 : doc.version,
    state: wasIssued ? 'draft' : doc.state,
    updatedAt: now.toISOString(),
  };
}

export function latestSnapshot(doc: CommissionDocument): IssuedSnapshot | null {
  return doc.issuedSnapshots.at(-1) ?? null;
}

export function recordPayment(
  doc: CommissionDocument,
  payment: Omit<Payment, 'id'>,
  now = new Date(),
): CommissionDocument {
  return {
    ...doc,
    payments: [...doc.payments, { ...payment, id: newId() }],
    updatedAt: now.toISOString(),
  };
}
