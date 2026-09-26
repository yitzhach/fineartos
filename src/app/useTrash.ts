/**
 * The Trash. Moving something to it hides it; it never deletes it. The
 * record stays in IndexedDB exactly as it was, which is why Put back is
 * instant. Emptying is the only thing in the app that destroys a record, and
 * TrashWindow asks the artist a second question before either door to it.
 *
 * Two hooks, because the lists need to know what is hidden before they can
 * be drawn, and the actions need the lists: state first, then the data, then
 * the actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Repository, StoredDocument } from '../persistence/repository';
import {
  attachedIds,
  countPhrase,
  deletionTargets,
  findEntry,
  orphanImageIds,
  removeEntry,
  summarise,
  trashedIds,
  trashItem,
  type AttachedRecord,
  type Trash,
  type TrashEntry,
} from '../os/trash';
import { loadTrash, saveTrash } from '../lib/prefs';
import { projectItemIds, type Project } from '../project/project';
import type { Invoice } from '../invoice/types';
import { editPhoto, sourceImageId, type Photo } from '../photo/photo';
import type { ClientUpdate } from '../commission/updates';
import type { Expense } from '../finance/ledger';
import { noteTitle, type Note } from '../notes/notes';
import { feeExpenseId, removePiece, type Show } from '../shows/shows';
import type { CustomWallpaper } from '../lib/wallpapers';

export function useTrashState() {
  const [trash, setTrash] = useState<Trash>(loadTrash);
  useEffect(() => saveTrash(trash), [trash]);
  // Read by actions made before the last render, which must see the Trash as
  // it is now rather than as it was when they were made.
  const trashRef = useRef(trash);
  useEffect(() => {
    trashRef.current = trash;
  }, [trash]);
  const hidden = useMemo(() => trashedIds(trash), [trash]);
  const applyTrash = useCallback((next: Trash) => {
    trashRef.current = next;
    setTrash(next);
  }, []);
  return { trash, trashRef, hidden, applyTrash };
}

export function useTrashActions(deps: {
  repo: Repository;
  trashState: ReturnType<typeof useTrashState>;
  rows: StoredDocument[];
  projects: Project[];
  invoices: Invoice[];
  photos: Photo[];
  shows: Show[];
  notes: Note[];
  allUpdates: ClientUpdate[];
  allShows: Show[];
  expenses: Expense[];
  reload: () => Promise<unknown>;
  wallpaperLibrary: CustomWallpaper[];
  closeWindowsFor: (ids: string[]) => void;
  pushUndoEntry: (label: string, undo: () => void | Promise<void>) => void;
  say: (text: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const { repo, trashState, rows, projects, invoices, photos, shows, allUpdates, allShows, expenses } = deps;
  const { trashRef, applyTrash } = trashState;
  const { closeWindowsFor, pushUndoEntry, say } = deps;
  // The lists as they are now. Undoing a Put back runs handleTrash from the
  // render where the item was still hidden, and looking it up in that
  // render's lists found nothing: the undo said it was done and did nothing.
  const latest = useRef({ rows, projects, invoices, photos, shows, notes: deps.notes });
  latest.current = { rows, projects, invoices, photos, shows, notes: deps.notes };

  /** What goes with a trashed record when it is emptied: updates and fee rows. */
  const trashAttached: AttachedRecord[] = [
    ...allUpdates,
    ...allShows
      .filter((show) => expenses.some((row) => row.id === feeExpenseId(show.id)))
      .map((show) => ({ id: feeExpenseId(show.id), documentId: show.id, kind: 'fee' as const })),
  ];

  const handleTrash = async (itemId: string) => {
    const { rows, projects, invoices, photos, shows, notes } = latest.current;
    const note = notes.find((one) => one.id === itemId);
    const project = projects.find((p) => p.id === itemId);
    const doc = rows.find((row) => row.id === itemId)?.document ?? null;
    const invoice = invoices.find((i) => i.id === itemId);
    const photo = photos.find((p) => p.id === itemId);
    const show = shows.find((one) => one.id === itemId);
    if (!project && !doc && !invoice && !photo && !show && !note) return;

    const entry: TrashEntry = project
      ? {
          id: project.id,
          kind: 'project',
          name: project.name,
          deletedAt: new Date().toISOString(),
          // The contents go in with the folder and come back out with it.
          contains: projectItemIds(project),
          fromFolderId: null,
        }
      : {
          id: itemId,
          kind: note ? 'note' : show ? 'show' : photo ? 'photo' : doc ? 'document' : 'invoice',
          name: note
            ? noteTitle(note)
            : show
            ? show.name
            : photo
            ? photo.title
            : doc
              ? doc.title.trim() || doc.documentNumber
              : invoice?.invoiceNumber ?? 'Invoice',
          deletedAt: new Date().toISOString(),
          contains: [],
          fromFolderId:
            projects.find((p) => p.documentIds.includes(itemId) || p.invoiceIds.includes(itemId))?.id ?? null,
        };

    applyTrash(trashItem(trashRef.current, entry));
    if (deps.selectedId === itemId) deps.setSelectedId(null);
    pushUndoEntry(`Move “${entry.name}” to the Trash`, () => handlePutBack(itemId, true));
    // The record is hidden now, so a window onto it would only show a
    // tombstone. Closing it loses nothing: Put back is one click away.
    closeWindowsFor(deletionTargets(entry));
    say(
      entry.contains.length > 0
        ? `“${entry.name}” and the ${countPhrase(entry.contains.length)} inside it went to the Trash. Nothing has been deleted.`
        : `“${entry.name}” went to the Trash. Nothing has been deleted.`,
    );
  };

  const handlePutBack = async (itemId: string, quiet = false) => {
    const entry = findEntry(trashRef.current, itemId);
    if (!entry) return;
    applyTrash(removeEntry(trashRef.current, itemId));
    if (quiet) return;
    pushUndoEntry(`Put “${entry.name}” back`, () => handleTrash(itemId));
    say(
      entry.fromFolderId
        ? `“${entry.name}” is back in its folder.`
        : `“${entry.name}” is back on the desktop.`,
    );
  };

  /**
   * The only code in the app that destroys anything. Both callers ask the
   * artist a second question first, in TrashWindow.
   */
  const destroy = async (entries: TrashEntry[]) => {
    const ids = entries.flatMap(deletionTargets);
    const removedImages: string[] = [];

    // A commission's updates are its own records and have no life without it.
    // Left behind they are orphans: invisible everywhere, and still stored.
    for (const updateId of attachedIds(ids, await repo.listUpdates())) {
      await repo.deleteUpdate(updateId);
    }

    // A show takes its booth-fee row with it and gives its pieces back.
    const allStoredShows = await repo.listShows();
    for (const show of allStoredShows.filter((one) => ids.includes(one.id))) {
      let current = show;
      const others = allStoredShows.filter((one) => !ids.includes(one.id) || one.id === show.id);
      for (const pieceId of show.pieceIds) {
        const piece = await repo.loadPhoto(pieceId);
        if (!piece) continue;
        const result = removePiece(current, piece, others);
        current = result.show;
        if (result.location !== undefined) await repo.savePhoto(editPhoto(piece, { location: result.location }));
      }
      await repo.deleteExpense(feeExpenseId(show.id));
      await repo.deleteShow(show.id);
    }

    for (const id of ids) {
      const storedPhoto = await repo.loadPhoto(id);
      if (storedPhoto) {
        removedImages.push(storedPhoto.imageId, sourceImageId(storedPhoto));
        await repo.deletePhoto(id);
        continue;
      }
      const stored = await repo.load(id);
      if (stored) {
        removedImages.push(...stored.document.artwork.referenceImageIds);
        await repo.deleteDocument(id);
        continue;
      }
      if (await repo.loadNote(id)) {
        await repo.deleteNote(id);
        continue;
      }
      if (await repo.loadInvoice(id)) {
        await repo.deleteInvoice(id);
        continue;
      }
      if (await repo.loadProject(id)) await repo.deleteProject(id);
    }

    // A photograph another commission still uses is never taken with it, and
    // neither is one being used as a desktop picture.
    const [remaining, remainingPhotos] = await Promise.all([repo.list(), repo.listPhotos()]);
    const stillUsed = new Set<string>([
      ...remaining.flatMap((row) => row.document.artwork.referenceImageIds),
      ...remainingPhotos.flatMap((photo) => [photo.imageId, sourceImageId(photo)]),
      ...deps.wallpaperLibrary.map((picture) => picture.imageId),
    ]);
    for (const imageId of orphanImageIds(removedImages, stillUsed)) {
      await repo.deleteImage(imageId);
    }

    closeWindowsFor(ids);

    // Many stores changed at once: read them all again — before the entries
    // leave the Trash, or the records they hid would show for a moment.
    await deps.reload();
    applyTrash(trashRef.current.filter((e) => !entries.some((gone) => gone.id === e.id)));
  };

  const handleDeleteForever = async (itemId: string) => {
    const entry = findEntry(trashRef.current, itemId);
    if (!entry) return;
    await destroy([entry]);
    say(`“${entry.name}” has been deleted for good.`);
  };

  const handleEmptyTrash = async () => {
    const going = trashRef.current;
    if (going.length === 0) return;
    const { records } = summarise(going, trashAttached);
    await destroy(going);
    say(`Trash emptied. ${countPhrase(records, 'record')} deleted for good.`);
  };

  return { trashAttached, handleTrash, handlePutBack, handleDeleteForever, handleEmptyTrash };
}
