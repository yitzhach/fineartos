/**
 * The Trash.
 *
 * The rule this file exists to enforce: moving something to the Trash never
 * deletes it. The record stays exactly where it was in storage and is simply
 * hidden from the desktop, the Finder and the lists until it is put back or
 * the Trash is emptied. Emptying is the only act in the app that destroys
 * anything, it is always asked for twice, and it never happens on a timer.
 *
 * DOM-free and tested, like the rest of the model layer.
 */

export type TrashKind = 'project' | 'document' | 'invoice' | 'photo' | 'show' | 'note';

export interface TrashEntry {
  id: string;
  kind: TrashKind;
  /** The name as it read when it was thrown away, so the Trash is legible. */
  name: string;
  deletedAt: string;
  /**
   * For a folder: the ids it was holding. They go in with it and come back
   * out with it, the way the contents of a folder follow the folder.
   */
  contains: string[];
  /** The folder it was filed in, so putting it back means what it says. */
  fromFolderId: string | null;
}

export type Trash = TrashEntry[];

/** Newest first: the thing most likely to have been a mistake is on top. */
export function trashItem(trash: Trash, entry: TrashEntry): Trash {
  return [entry, ...trash.filter((e) => e.id !== entry.id)];
}

export function findEntry(trash: Trash, id: string): TrashEntry | null {
  return trash.find((entry) => entry.id === id) ?? null;
}

export function removeEntry(trash: Trash, id: string): Trash {
  return trash.filter((entry) => entry.id !== id);
}

/**
 * Everything the Trash is hiding — the entries themselves and whatever was
 * inside a trashed folder. A document inside a binned folder must not show up
 * on its own in the Finder; it went in with the folder.
 */
export function trashedIds(trash: Trash): Set<string> {
  const ids = new Set<string>();
  for (const entry of trash) {
    ids.add(entry.id);
    for (const child of entry.contains) ids.add(child);
  }
  return ids;
}

/** The records emptying this entry would destroy — the folder and its contents. */
export function deletionTargets(entry: TrashEntry): string[] {
  return [entry.id, ...entry.contains];
}

/**
 * A child record that belongs to a commission rather than standing on its own
 * — a client update. It is never in the Trash by itself: it goes when the
 * commission it belongs to goes, and until then it is only hidden.
 *
 * Structural on purpose, so the Trash need not know what an update is.
 */
export interface AttachedRecord {
  id: string;
  /** The record it belongs to: a commission, or a show. */
  documentId: string;
  /** A client update unless said otherwise; 'fee' is a show's booth-fee row. */
  kind?: 'update' | 'fee';
}

/**
 * The child records that would go with what is being deleted. Left behind,
 * these are orphans: rows pointing at a commission that no longer exists,
 * invisible in the app and still taking up room.
 */
export function attachedIds(targets: string[], attached: AttachedRecord[]): string[] {
  const going = new Set(targets);
  return attached.filter((record) => going.has(record.documentId)).map((record) => record.id);
}

export interface TrashSummary {
  entries: number;
  /** Records, counting what is inside a folder. This is the honest number. */
  records: number;
  folders: number;
  documents: number;
  invoices: number;
  pictures: number;
  shows: number;
  notes: number;
  /** Booth-fee rows in the books that would go with the shows above. */
  fees: number;
  /** Client updates that would go with the commissions above. */
  updates: number;
}

/**
 * What emptying would actually destroy. The confirmation quotes `records`,
 * not `entries`: "delete 1 item" would be a lie about a folder holding nine.
 */
export function summarise(trash: Trash, attached: AttachedRecord[] = []): TrashSummary {
  let records = 0;
  let folders = 0;
  let documents = 0;
  let invoices = 0;
  let pictures = 0;
  let shows = 0;
  let notes = 0;

  for (const entry of trash) {
    records += deletionTargets(entry).length;
    if (entry.kind === 'project') folders += 1;
    else if (entry.kind === 'document') documents += 1;
    else if (entry.kind === 'photo') pictures += 1;
    else if (entry.kind === 'show') shows += 1;
    else if (entry.kind === 'note') notes += 1;
    else invoices += 1;
  }

  // The updates go too, so the number the confirmation quotes has to count
  // them: "delete 4 records" that turns out to be seven is the lie rule 2
  // exists to prevent.
  const going = trash.flatMap(deletionTargets);
  const updates = attachedIds(going, attached.filter((one) => one.kind !== 'fee')).length;
  const fees = attachedIds(going, attached.filter((one) => one.kind === 'fee')).length;

  return {
    entries: trash.length,
    records: records + updates + fees,
    folders,
    documents,
    invoices,
    pictures,
    shows,
    notes,
    fees,
    updates,
  };
}

/** "3 items", "1 item" — never a bare number with no noun. */
export function countPhrase(count: number, noun = 'item'): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** How long something has been in the Trash, for the list. */
export function describeWhen(deletedAt: string, now = new Date()): string {
  const then = new Date(deletedAt).getTime();
  if (Number.isNaN(then)) return 'Unknown';

  const minutes = Math.floor((now.getTime() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${countPhrase(minutes, 'minute')} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${countPhrase(hours, 'hour')} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${countPhrase(days, 'day')} ago`;
  return new Date(deletedAt).toLocaleDateString();
}

/**
 * Images that nothing left alive refers to. Called when records are destroyed
 * for good, so a deleted commission does not leave its photographs behind —
 * and so a photograph another commission still uses is never taken with it.
 */
export function orphanImageIds(
  removedImageIds: string[],
  stillUsedImageIds: Iterable<string>,
): string[] {
  const kept = new Set(stillUsedImageIds);
  return [...new Set(removedImageIds)].filter((id) => !kept.has(id));
}
