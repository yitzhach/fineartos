/**
 * The studio's records as the shell holds them, and the one-record changes
 * that keep that copy in step with storage.
 *
 * A save used to re-read every store to show one edit, which is every
 * commission, invoice, photograph and row in the books on each keystroke.
 * Now a save puts the one record it wrote into the list, in the same place
 * a full read would have put it: the repository sorts with the orders
 * below, so the two can never disagree.
 */
import type { StoredDocument } from './repository';
import type { Project } from '../project/project';
import type { Invoice } from '../invoice/types';
import type { ClientUpdate } from '../commission/updates';
import type { Expense } from '../finance/ledger';
import type { Show } from '../shows/shows';
import type { GuestEntry } from '../connect/guestbook';
import type { Note } from '../notes/notes';
import type { ClientProfile, ImportedContact } from '../clients/clients';
import { sourceImageId, type Photo } from '../photo/photo';

// --- The order each store is listed in, newest first -------------------------

export const byDocumentUpdated = (a: StoredDocument, b: StoredDocument): number =>
  b.document.updatedAt.localeCompare(a.document.updatedAt);

export const byUpdated = (a: { updatedAt: string }, b: { updatedAt: string }): number =>
  b.updatedAt.localeCompare(a.updatedAt);

export const byCreated = (a: { createdAt: string }, b: { createdAt: string }): number =>
  b.createdAt.localeCompare(a.createdAt);

export const byDate = (a: { date: string }, b: { date: string }): number =>
  b.date.localeCompare(a.date);

// --- Fields added after a record was first written ---------------------------

/**
 * Fields added after a record was first written come back undefined from
 * storage. Filling them in on read means the rest of the app never has to
 * ask whether a folder is old or new.
 */
export function withImageIds(project: Project): Project {
  return { ...project, imageIds: project.imageIds ?? [] };
}

export function invoiceWithImageIds(invoice: Invoice): Invoice {
  return { ...invoice, imageIds: invoice.imageIds ?? [] };
}

// --- One record in, one record out --------------------------------------------

/**
 * The list with this record in it: replaced where it was, or added when it is
 * new, then put in the store's order. The list passed in is not changed.
 */
export function upsertRecord<T extends { id: string }>(
  list: readonly T[],
  record: T,
  order: (a: T, b: T) => number,
): T[] {
  const at = list.findIndex((one) => one.id === record.id);
  const next = at === -1 ? [record, ...list] : list.map((one, i) => (i === at ? record : one));
  return next.sort(order);
}

/** The list without this record. The same list back when it was not there. */
export function removeRecord<T extends { id: string }>(list: T[], id: string): T[] {
  return list.some((one) => one.id === id) ? list.filter((one) => one.id !== id) : list;
}

// --- Everything, and what is on show ----------------------------------------

/** Every record in every store, the Trash included. */
export interface StudioRecords {
  documents: StoredDocument[];
  projects: Project[];
  invoices: Invoice[];
  photos: Photo[];
  updates: ClientUpdate[];
  expenses: Expense[];
  shows: Show[];
  guests: GuestEntry[];
  notes: Note[];
  profiles: ClientProfile[];
  contacts: ImportedContact[];
}

export function emptyRecords(): StudioRecords {
  return {
    documents: [],
    projects: [],
    invoices: [],
    photos: [],
    updates: [],
    expenses: [],
    shows: [],
    guests: [],
    notes: [],
    profiles: [],
    contacts: [],
  };
}

/**
 * What the desktop, the Finder and the lists show. Everything in the Trash is
 * hidden; the records themselves are untouched in storage, which is what
 * makes Put back instant and lossless. An update belongs to its commission:
 * one in the Trash takes its updates out of sight with it. The books are
 * never hidden — a row stays a row until it is removed.
 */
export function visibleRecords(all: StudioRecords, hidden: ReadonlySet<string>): StudioRecords {
  return {
    documents: outOfTrash(all.documents, hidden),
    projects: outOfTrash(all.projects, hidden),
    invoices: outOfTrash(all.invoices, hidden),
    photos: outOfTrash(all.photos, hidden),
    updates: updatesInSight(all.updates, hidden),
    expenses: all.expenses,
    shows: outOfTrash(all.shows, hidden),
    guests: all.guests,
    notes: outOfTrash(all.notes, hidden),
    profiles: all.profiles,
    contacts: all.contacts,
  };
}

/** The records that are not in the Trash. */
export function outOfTrash<T extends { id: string }>(list: T[], hidden: ReadonlySet<string>): T[] {
  return list.filter((one) => !hidden.has(one.id));
}

/** Updates whose commission is not in the Trash. */
export function updatesInSight(updates: ClientUpdate[], hidden: ReadonlySet<string>): ClientUpdate[] {
  return updates.filter((update) => !hidden.has(update.documentId));
}

/**
 * Every image an open window might show, as one sorted key. The key only
 * changes when the set does, so editing a title does not remake every
 * picture's URL.
 */
export function imageIdsKey(records: {
  documents: StoredDocument[];
  projects: Project[];
  photos: Photo[];
  expenses: Expense[];
}): string {
  const ids = new Set<string>();
  for (const row of records.documents) {
    for (const id of row.document.artwork.referenceImageIds) ids.add(id);
    if (row.document.studio.logoImageId) ids.add(row.document.studio.logoImageId);
  }
  for (const project of records.projects) if (project.coverImageId) ids.add(project.coverImageId);
  for (const expense of records.expenses) for (const id of expense.receiptImageIds) ids.add(id);
  for (const photo of records.photos) {
    ids.add(photo.imageId);
    // The editor works from the photograph, which is a second blob once an
    // edit has been saved over it.
    ids.add(sourceImageId(photo));
  }
  return [...ids].sort().join(',');
}

/** What changed between two image-id keys, so a URL map is patched, not rebuilt. */
export function diffIdsKey(before: string, after: string): { added: string[]; removed: string[] } {
  const was = new Set(before ? before.split(',') : []);
  const now = new Set(after ? after.split(',') : []);
  return {
    added: [...now].filter((id) => !was.has(id)),
    removed: [...was].filter((id) => !now.has(id)),
  };
}

/**
 * The images drawn at full size right now: the pictures open on their own or
 * in the darkroom, the one in the preview and its neighbours, and those on an
 * open commission (the client page prints them). Everything else draws its
 * thumbnail.
 */
export function fullImageIdsKey(input: {
  photos: Photo[];
  documents: StoredDocument[];
  photoIds: string[];
  docIds: string[];
}): string {
  const ids = new Set<string>();
  const wantPhotos = new Set(input.photoIds);
  for (const photo of input.photos) {
    if (!wantPhotos.has(photo.id)) continue;
    ids.add(photo.imageId);
    ids.add(sourceImageId(photo));
  }
  const wantDocs = new Set(input.docIds);
  for (const row of input.documents) {
    if (!wantDocs.has(row.document.id)) continue;
    for (const id of row.document.artwork.referenceImageIds) ids.add(id);
    if (row.document.studio.logoImageId) ids.add(row.document.studio.logoImageId);
  }
  return [...ids].sort().join(',');
}
