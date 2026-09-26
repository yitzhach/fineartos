/**
 * Clients and Notes, wired to the studio. Loaded with the tools rather than
 * with the shell: building every person from the records is only needed
 * when one of these windows is open. The shell keeps only what Coming up and
 * the search box need, read off the stored profiles and notes.
 */
import { useMemo } from 'react';
import type { StoredDocument } from '../persistence/repository';
import type { Invoice } from '../invoice/types';
import type { GuestEntry } from '../connect/guestbook';
import type { Show } from '../shows/shows';
import type { Project } from '../project/project';
import type { Photo } from '../photo/photo';
import {
  buildPeople,
  markDifferent,
  mergePeople,
  personFor,
  possibleSamePeople,
  type ClientProfile,
  type ClientSource,
  type ImportedContact,
  type Person,
} from '../clients/clients';
import { newContacts, parseContacts } from '../clients/contactImport';
import type { Note, Pin } from '../notes/notes';
import { ClientsWindow } from '../clients/ui/ClientsWindow';
import { NotesWindow } from '../notes/ui/NotesWindow';

export interface PeopleRecords {
  rows: StoredDocument[];
  invoices: Invoice[];
  guests: GuestEntry[];
  contacts: ImportedContact[];
  profiles: ClientProfile[];
  notes: Note[];
  shows: Show[];
  projects: Project[];
  photos: Photo[];
}

export interface PeopleActions {
  saveProfile: (profile: ClientProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  saveNote: (note: Note) => Promise<void>;
  saveContacts: (contacts: ImportedContact[]) => Promise<void>;
  reload: () => Promise<unknown>;
  trash: (id: string) => void;
  say: (message: string) => void;
  openPin: (pin: Pin) => void;
  openGuestBook: () => void;
  openNotes: (focus: { id: string } | { newPin: Pin | null }) => void;
}

function usePeople(records: PeopleRecords): Person[] {
  const { rows, invoices, guests, contacts, profiles } = records;
  return useMemo(
    () => buildPeople({ documents: rows, invoices, guests, contacts, profiles }),
    [rows, invoices, guests, contacts, profiles],
  );
}

/** A note pinned to a client points at whatever id they had then; show it against who that is now. */
function useNotesNow(notes: Note[], people: Person[]): Note[] {
  return useMemo(
    () =>
      notes.map((note) => {
        if (note.pin?.kind !== 'client') return note;
        const person = personFor(people, note.pin.id);
        return person && person.id !== note.pin.id ? { ...note, pin: { kind: 'client' as const, id: person.id } } : note;
      }),
    [notes, people],
  );
}

async function guarded(say: (m: string) => void, what: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (cause) {
    say(`${what} could not be saved: ${String(cause)}`);
  }
}

export function ClientsTool({
  records,
  actions,
  focus,
}: {
  records: PeopleRecords;
  actions: PeopleActions;
  focus: { id: string } | null;
}) {
  const people = usePeople(records);
  const notes = useNotesNow(records.notes, people);
  const pairs = useMemo(() => possibleSamePeople(people), [people]);
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of notes) if (note.pin?.kind === 'client') counts[note.pin.id] = (counts[note.pin.id] ?? 0) + 1;
    return counts;
  }, [notes]);
  const { say } = actions;
  const saveProfile = (profile: ClientProfile) => void guarded(say, 'The client', () => actions.saveProfile(profile));

  const importContacts = async (file: File) => {
    const result = parseContacts(await file.text());
    if (!result) {
      say('Import refused: this is not a vCard, and no column in it reads as a name, email or phone.');
      return;
    }
    const incoming = newContacts(result.contacts, records.contacts);
    try {
      await actions.saveContacts(incoming);
    } catch (cause) {
      say(`The contacts could not be saved: ${String(cause)}`);
      await actions.reload();
      return;
    }
    const already = result.contacts.length - incoming.length;
    say(
      [
        `${incoming.length === 1 ? '1 contact' : `${incoming.length} contacts`} added`,
        already > 0 ? `${already} already here and left alone` : null,
        result.skipped > 0 ? `${result.skipped} with no name, email or phone skipped` : null,
      ]
        .filter(Boolean)
        .join('. ') + '.',
    );
  };

  const openSource = (source: ClientSource) => {
    if (source.kind === 'commission') actions.openPin({ kind: 'commission', id: source.id });
    else if (source.kind === 'invoice') actions.openPin({ kind: 'invoice', id: source.id });
    else if (source.kind === 'guest') actions.openGuestBook();
    else say('An imported contact is only its name, email and phone — there is nothing more to open.');
  };

  return (
    <ClientsWindow
      people={people}
      pairs={pairs}
      onSaveProfile={saveProfile}
      onMerge={(a, b) =>
        void guarded(say, 'The merge', async () => {
          const { keep, drop } = mergePeople(a, b);
          await actions.saveProfile(keep);
          if (drop) await actions.deleteProfile(drop);
          say(`${a.name} and ${b.name} are now one person.`);
        })
      }
      onDifferent={(a, b) => saveProfile(markDifferent(a, b))}
      onImport={(file) => void importContacts(file)}
      onOpenSource={openSource}
      onNote={(person) => {
        const pinned = notes.find((n) => n.pin?.kind === 'client' && n.pin.id === person.id);
        actions.openNotes(pinned ? { id: pinned.id } : { newPin: { kind: 'client', id: person.id } });
      }}
      noteCounts={noteCounts}
      focus={focus}
    />
  );
}

export function NotesTool({
  records,
  actions,
  focus,
}: {
  records: PeopleRecords;
  actions: PeopleActions;
  focus: { id: string } | { newPin: Pin | null } | null;
}) {
  const people = usePeople(records);
  const notes = useNotesNow(records.notes, people);
  const { rows, invoices, shows, projects, photos } = records;
  const targets = useMemo(
    () => [
      ...people.map((p) => ({ pin: { kind: 'client' as const, id: p.id }, label: `Client · ${p.name}` })),
      ...rows.map((row) => ({
        pin: { kind: 'commission' as const, id: row.id },
        label: `Commission · ${row.document.title.trim() || row.document.documentNumber}`,
      })),
      ...invoices.map((i) => ({ pin: { kind: 'invoice' as const, id: i.id }, label: `Invoice · ${i.invoiceNumber}` })),
      ...shows.map((s) => ({ pin: { kind: 'show' as const, id: s.id }, label: `Show · ${s.name}` })),
      ...projects.map((p) => ({ pin: { kind: 'project' as const, id: p.id }, label: `Folder · ${p.name}` })),
      ...photos.map((p) => ({ pin: { kind: 'photo' as const, id: p.id }, label: `Picture · ${p.title}` })),
    ],
    [people, rows, invoices, shows, projects, photos],
  );

  return (
    <NotesWindow
      notes={notes}
      targets={targets}
      onSave={(note) => void guarded(actions.say, 'The note', () => actions.saveNote(note))}
      onDelete={(note) => actions.trash(note.id)}
      onOpenPin={actions.openPin}
      onMessage={actions.say}
      focus={focus}
    />
  );
}
