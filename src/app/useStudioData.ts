/**
 * The studio's records: read once on start, then kept in step one record at
 * a time. A save writes its record and puts that same record into state —
 * it does not re-read every store. `reload` is for the few things that
 * write many records at once (an import, emptying the Trash) and for coming
 * back online.
 *
 * State holds every record, the Trash included. What the desktop and the
 * lists see is derived from it and the Trash, so moving something to the
 * Trash or putting it back needs no read at all.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Repository } from '../persistence/repository';
import { drainQueue, type CloudAdapter } from '../persistence/sync';
import {
  byCreated,
  byDate,
  byDocumentUpdated,
  byUpdated,
  emptyRecords,
  invoiceWithImageIds,
  outOfTrash,
  removeRecord,
  updatesInSight,
  upsertRecord,
  withImageIds,
  type StudioRecords,
} from '../persistence/records';
import type { CommissionDocument } from '../commission/types';
import type { Project } from '../project/project';
import type { Invoice } from '../invoice/types';
import type { Photo } from '../photo/photo';
import type { ClientUpdate } from '../commission/updates';
import type { Expense } from '../finance/ledger';
import type { Show } from '../shows/shows';
import type { GuestEntry } from '../connect/guestbook';
import type { Note } from '../notes/notes';
import type { ClientProfile, ImportedContact } from '../clients/clients';
import { loadGuests, retireLocalGuests } from '../lib/prefs';
import { newId } from '../commission/document';
import { demoAlreadySeeded, markDemoSeeded } from '../lib/demoSeeded';

export function useStudioData(options: {
  repo: Repository;
  cloud: CloudAdapter;
  workspaceId: string;
  /** What is in the Trash: hidden from every list, kept in storage. */
  hidden: ReadonlySet<string>;
  /** A failure the artist must see — a guest book that could not be moved. */
  onProblem: (message: string) => void;
  /** Called once, after the first read that succeeds, with every record. */
  onFirstRead: (records: StudioRecords) => void;
}) {
  const { repo, cloud, workspaceId, hidden } = options;
  const [all, setAll] = useState<StudioRecords>(emptyRecords);
  /** False until the first read from IndexedDB has come back. */
  const [loaded, setLoaded] = useState(false);
  const firstReadRef = useRef(false);
  const onFirstReadRef = useRef(options.onFirstRead);
  onFirstReadRef.current = options.onFirstRead;
  const onProblemRef = useRef(options.onProblem);
  onProblemRef.current = options.onProblem;

  /** Every store, read again. */
  const reload = useCallback(async (): Promise<StudioRecords | null> => {
    let records: StudioRecords;
    try {
      const [documents, projects, invoices, photos, updates, expenses, shows, guests, notes, profiles, contacts] = await Promise.all([
        repo.list(),
        repo.listProjects(),
        repo.listInvoices(),
        repo.listPhotos(),
        repo.listUpdates(),
        repo.listExpenses(),
        repo.listShows(),
        repo.listGuests(),
        repo.listNotes(),
        repo.listClientProfiles(),
        repo.listContacts(),
      ]);
      records = { documents, projects, invoices, photos, updates, expenses, shows, guests, notes, profiles, contacts };
    } catch (cause) {
      // The database reports its own problem through onDbProblem; this stops
      // the app pretending the studio is empty when it simply cannot be read.
      // eslint-disable-next-line no-console
      console.error('Could not read the studio', cause);
      return null;
    }
    setAll(records);
    setLoaded(true);
    if (!firstReadRef.current) {
      firstReadRef.current = true;
      onFirstReadRef.current(records);
    }
    return records;
  }, [repo]);

  useEffect(() => {
    void (async () => {
      // First run only: seed one clearly-labelled demo commission so the app
      // opens showing what it does. Seeded once, so removing it sticks.
      if (!demoAlreadySeeded()) {
        const existing = await repo.list();
        if (existing.length === 0) {
          const { buildDemo, drawDemoArtwork } = await import('../lib/demo');
          const demo = buildDemo();
          let doc = demo.document;

          const artwork = await drawDemoArtwork();
          if (artwork) {
            const imageId = newId();
            try {
              await repo.putImage(imageId, artwork);
              doc = { ...doc, artwork: { ...doc.artwork, referenceImageIds: [imageId] } };
              // The folder keeps its own face. The artwork belongs to the
              // commission inside it, and shows when the folder is opened.
            } catch {
              // An image the store refuses is not worth failing the seed over.
            }
          }

          await repo.save(doc, cloud.configured);
          await repo.saveProject(demo.project);
        }
        markDemoSeeded();
      }

      // Database version 7: the guest book moves in from localStorage. The
      // old copy is retired only once every entry is in; a failure says so.
      const local = loadGuests();
      if (local.length > 0) {
        try {
          const stored = new Set((await repo.listGuests()).map((guest) => guest.id));
          for (const guest of local) if (!stored.has(guest.id)) await repo.saveGuest(guest);
          retireLocalGuests();
        } catch (cause) {
          onProblemRef.current(
            `The guest book could not be moved into the studio database (${String(cause)}). It is still on this device; reload to try again.`,
          );
        }
      }

      await reload();
      // Nothing here claims a sync: with no adapter configured the drain is a
      // no-op, and the status bar says cloud sync is unconfigured.
      await drainQueue(repo, workspaceId, cloud);
    })();
  }, [cloud, reload, repo, workspaceId]);

  useEffect(() => {
    const onOnline = () => void drainQueue(repo, workspaceId, cloud).then(reload);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [cloud, reload, repo, workspaceId]);

  // --- One record at a time -------------------------------------------------

  const saveDocument = useCallback(
    async (doc: CommissionDocument) => {
      const row = await repo.save(doc, cloud.configured);
      setAll((s) => ({ ...s, documents: upsertRecord(s.documents, row, byDocumentUpdated) }));
    },
    [cloud, repo],
  );

  const archiveDocument = useCallback(
    async (id: string) => {
      await repo.archive(id);
      const row = await repo.load(id);
      if (row) setAll((s) => ({ ...s, documents: upsertRecord(s.documents, row, byDocumentUpdated) }));
    },
    [repo],
  );

  const saveProject = useCallback(
    async (project: Project) => {
      await repo.saveProject(project);
      const stored = withImageIds(project);
      setAll((s) => ({ ...s, projects: upsertRecord(s.projects, stored, byUpdated) }));
    },
    [repo],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await repo.deleteProject(id);
      setAll((s) => ({ ...s, projects: removeRecord(s.projects, id) }));
    },
    [repo],
  );

  const saveInvoice = useCallback(
    async (invoice: Invoice) => {
      await repo.saveInvoice(invoice);
      const stored = invoiceWithImageIds(invoice);
      setAll((s) => ({ ...s, invoices: upsertRecord(s.invoices, stored, byUpdated) }));
    },
    [repo],
  );

  const savePhoto = useCallback(
    async (photo: Photo) => {
      await repo.savePhoto(photo);
      setAll((s) => ({ ...s, photos: upsertRecord(s.photos, photo, byUpdated) }));
    },
    [repo],
  );

  const saveUpdate = useCallback(
    async (update: ClientUpdate) => {
      await repo.saveUpdate(update);
      setAll((s) => ({ ...s, updates: upsertRecord(s.updates, update, byCreated) }));
    },
    [repo],
  );

  const deleteUpdate = useCallback(
    async (id: string) => {
      await repo.deleteUpdate(id);
      setAll((s) => ({ ...s, updates: removeRecord(s.updates, id) }));
    },
    [repo],
  );

  const saveExpense = useCallback(
    async (expense: Expense) => {
      await repo.saveExpense(expense);
      setAll((s) => ({ ...s, expenses: upsertRecord(s.expenses, expense, byDate) }));
    },
    [repo],
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      await repo.deleteExpense(id);
      setAll((s) => ({ ...s, expenses: removeRecord(s.expenses, id) }));
    },
    [repo],
  );

  const saveShow = useCallback(
    async (show: Show) => {
      await repo.saveShow(show);
      setAll((s) => ({ ...s, shows: upsertRecord(s.shows, show, byCreated) }));
    },
    [repo],
  );

  const saveGuest = useCallback(
    async (guest: GuestEntry) => {
      await repo.saveGuest(guest);
      setAll((s) => ({
        ...s,
        guests: upsertRecord(s.guests, guest, (a, b) => b.signedAt.localeCompare(a.signedAt)),
      }));
    },
    [repo],
  );

  const deleteGuest = useCallback(
    async (id: string) => {
      await repo.deleteGuest(id);
      setAll((s) => ({ ...s, guests: removeRecord(s.guests, id) }));
    },
    [repo],
  );

  const saveNote = useCallback(
    async (note: Note) => {
      await repo.saveNote(note);
      setAll((s) => ({ ...s, notes: upsertRecord(s.notes, note, byUpdated) }));
    },
    [repo],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await repo.deleteNote(id);
      setAll((s) => ({ ...s, notes: removeRecord(s.notes, id) }));
    },
    [repo],
  );

  const saveProfile = useCallback(
    async (profile: ClientProfile) => {
      await repo.saveClientProfile(profile);
      setAll((s) => ({ ...s, profiles: upsertRecord(s.profiles, profile, byCreated) }));
    },
    [repo],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      await repo.deleteClientProfile(id);
      setAll((s) => ({ ...s, profiles: removeRecord(s.profiles, id) }));
    },
    [repo],
  );

  const saveContacts = useCallback(
    async (contacts: ImportedContact[]) => {
      for (const contact of contacts) await repo.saveContact(contact);
      setAll((s) => ({ ...s, contacts: [...s.contacts, ...contacts] }));
    },
    [repo],
  );

  // --- What is on show ------------------------------------------------------

  // Each list is derived on its own, so a save to one store leaves the others
  // exactly as they were — the same arrays, and nothing downstream redrawn.
  const documents = useMemo(() => outOfTrash(all.documents, hidden), [all.documents, hidden]);
  const projects = useMemo(() => outOfTrash(all.projects, hidden), [all.projects, hidden]);
  const invoices = useMemo(() => outOfTrash(all.invoices, hidden), [all.invoices, hidden]);
  const photos = useMemo(() => outOfTrash(all.photos, hidden), [all.photos, hidden]);
  const updates = useMemo(() => updatesInSight(all.updates, hidden), [all.updates, hidden]);
  const shows = useMemo(() => outOfTrash(all.shows, hidden), [all.shows, hidden]);
  const notesInSight = useMemo(() => outOfTrash(all.notes, hidden), [all.notes, hidden]);

  return {
    loaded,
    reload,
    /** Visible: not in the Trash. */
    rows: documents,
    projects,
    invoices,
    photos,
    clientUpdates: updates,
    expenses: all.expenses,
    shows,
    /** Every update, trashed commissions included: the Trash has to count what emptying would take. */
    allUpdates: all.updates,
    /** Every show, trashed ones included, so emptying the Trash can count their fee rows. */
    allShows: all.shows,
    saveDocument,
    archiveDocument,
    saveProject,
    deleteProject,
    saveInvoice,
    savePhoto,
    saveUpdate,
    deleteUpdate,
    saveExpense,
    deleteExpense,
    saveShow,
    guests: all.guests,
    notes: notesInSight,
    allNotes: all.notes,
    profiles: all.profiles,
    contacts: all.contacts,
    saveGuest,
    deleteGuest,
    saveNote,
    deleteNote,
    saveProfile,
    deleteProfile,
    saveContacts,
  };
}
