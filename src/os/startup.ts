/**
 * What the desktop opens with, decided once, on the first read of the studio.
 */
import { restorable, subjectIdOf, type WindowState } from './windows';
import type { StudioRecords } from '../persistence/records';

export type Opening =
  | { kind: 'restore'; windows: WindowState[] }
  | { kind: 'newest'; docId: string; documentNumber: string }
  | { kind: 'nothing' };

/**
 * The windows that were open, when there are any to put back — each checked
 * against the records, so nothing reopens onto a deleted or trashed thing.
 *
 * Only when nothing comes back does the newest commission open. A first
 * visit still starts in work, and a reload no longer piles a commission on
 * top of the arrangement the artist left.
 */
export function openingWindows(input: {
  /** The "reopen windows" preference. */
  restoreOn: boolean;
  /** What storage held, untrusted. */
  saved: unknown;
  /** Every record, the Trash included. */
  records: StudioRecords;
  /** What is in the Trash. */
  hidden: ReadonlySet<string>;
}): Opening {
  const { records, hidden } = input;
  if (input.restoreOn) {
    const live = {
      documents: new Set(records.documents.map((row) => row.id)),
      invoices: new Set(records.invoices.map((invoice) => invoice.id)),
      projects: new Set(records.projects.map((project) => project.id)),
      photos: new Set(records.photos.map((photo) => photo.id)),
    };
    const back = restorable(input.saved, (kind) => {
      if (hidden.has(subjectIdOf(kind) ?? '')) return false;
      switch (kind.type) {
        case 'commission':
          return live.documents.has(kind.docId);
        case 'invoice':
          return live.invoices.has(kind.invoiceId);
        case 'folder':
          return live.projects.has(kind.projectId);
        case 'photo':
        case 'photoEdit':
          return live.photos.has(kind.photoId);
        default:
          return true;
      }
    });
    if (back.length > 0) return { kind: 'restore', windows: back };
  }
  // Newest first, the order the repository lists them in.
  const newest = records.documents.find((row) => !hidden.has(row.id));
  return newest
    ? { kind: 'newest', docId: newest.id, documentNumber: newest.document.documentNumber }
    : { kind: 'nothing' };
}
