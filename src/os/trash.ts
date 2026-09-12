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

export type TrashKind = 'project' | 'document' | 'invoice' | 'photo';

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

export interface TrashSummary {
  entries: number;
  /** Records, counting what is inside a folder. This is the honest number. */
  records: number;
  folders: number;
  documents: number;
  invoices: number;
  pictures: number;
}

/**
 * What emptying would actually destroy. The confirmation quotes `records`,
 * not `entries`: "delete 1 item" would be a lie about a folder holding nine.
 */
export function summarise(trash: Trash): TrashSummary {
  let records = 0;
  let folders = 0;
  let documents = 0;
  let invoices = 0;
  let pictures = 0;

  for (const entry of trash) {
    records += deletionTargets(entry).length;
    if (entry.kind === 'project') folders += 1;
    else if (entry.kind === 'document') documents += 1;
    else if (entry.kind === 'photo') pictures += 1;
    else invoices += 1;
  }

  return { entries: trash.length, records, folders, documents, invoices, pictures };
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
