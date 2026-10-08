/**
 * Builds the assistant's view of the device and turns a confirmed operation
 * into calls on the shell. DOM-free; the shell passes its records and its own
 * handlers, so the assistant changes nothing a button couldn't.
 */
import { addCheckItem, createNote, editNote, noteTitle, placeNote, placeOf, type Note } from '../notes/notes';
import type { Project } from '../project/project';
import type { DeviceOp, KeepOn, Snapshot, SnapshotItem } from './actions';

export interface StudioRecords {
  projects: Project[];
  documents: { id: string; title: string; documentNumber: string; archived: boolean }[];
  invoices: { id: string; invoiceNumber: string }[];
  photos: { id: string; title: string }[];
  notes: Note[];
  tools: string[];
  open: string[];
}

export interface StudioHandlers {
  saveNote: (note: Note) => Promise<void>;
  newFolder: (name: string) => Promise<void>;
  fileInto: (folderId: string, itemId: string) => Promise<void>;
  trash: (itemId: string) => Promise<void> | void;
}

export function buildSnapshot(r: StudioRecords): Snapshot {
  const docName = (d: StudioRecords['documents'][number]) => d.title.trim() || d.documentNumber;
  const byId = new Map<string, SnapshotItem>([
    ...r.documents.map((d) => [d.id, { id: d.id, kind: 'commission' as const, name: docName(d) }] as const),
    ...r.invoices.map((i) => [i.id, { id: i.id, kind: 'invoice' as const, name: i.invoiceNumber }] as const),
    ...r.photos.map((p) => [p.id, { id: p.id, kind: 'photo' as const, name: p.title }] as const),
  ]);
  const filed = new Set<string>();
  const folders = r.projects.map((p) => {
    const ids = [...p.documentIds, ...p.invoiceIds, ...(p.imageIds ?? [])];
    ids.forEach((id) => filed.add(id));
    const notes = r.notes.filter((n) => n.pin?.kind === 'project' && n.pin.id === p.id).map((n) => ({ id: n.id, kind: 'note' as const, name: noteTitle(n) }));
    return { id: p.id, name: p.name, items: [...ids.map((id) => byId.get(id)).filter((i): i is SnapshotItem => Boolean(i)), ...notes] };
  });
  const desktop = [
    ...r.documents.filter((d) => !d.archived && !filed.has(d.id)).map((d) => byId.get(d.id)!),
    ...r.invoices.filter((i) => !filed.has(i.id)).map((i) => byId.get(i.id)!),
    ...r.photos.filter((p) => !filed.has(p.id)).map((p) => byId.get(p.id)!),
    ...r.notes.filter((n) => placeOf(n).type === 'desktop').map((n) => ({ id: n.id, kind: 'note' as const, name: noteTitle(n) })),
  ];
  const folderName = (id: string) => r.projects.find((p) => p.id === id)?.name ?? 'a folder since removed';
  const notes = r.notes.slice(0, 300).map((n) => {
    const place = placeOf(n);
    return { id: n.id, title: noteTitle(n), place: place.type === 'folder' ? `folder “${folderName(place.id)}”` : place.type === 'desktop' ? 'home screen' : 'Notes only' };
  });
  return { folders, desktop, notes, tools: r.tools, open: r.open };
}

const placeFor = (keepOn: KeepOn) => (keepOn.type === 'folder' ? { type: 'folder' as const, id: keepOn.id } : keepOn);

/** Carries out one operation; returns what was done, in a line. */
export async function runOp(op: DeviceOp, r: StudioRecords, h: StudioHandlers, now = new Date()): Promise<string> {
  const where = (k: KeepOn) => (k.type === 'folder' ? `in the folder “${r.projects.find((p) => p.id === k.id)?.name ?? ''}”` : k.type === 'desktop' ? 'on the home screen' : 'in Notes');
  switch (op.type) {
    case 'note-create': {
      let note = editNote(createNote(op.text, null, now), { title: op.title }, now);
      for (const item of op.checklist) note = addCheckItem(note, item, now);
      note = placeNote(note, placeFor(op.keepOn), now);
      await h.saveNote(note);
      return `Note “${noteTitle(note)}” saved ${where(op.keepOn)}.`;
    }
    case 'note-edit': {
      const found = r.notes.find((n) => n.id === op.id);
      if (!found) throw new Error('That note is no longer here.');
      let note = editNote(found, { ...(op.title !== undefined ? { title: op.title } : {}), ...(op.text !== undefined ? { text: op.text } : {}) }, now);
      for (const item of op.addItems) note = addCheckItem(note, item, now);
      if (op.keepOn) note = placeNote(note, placeFor(op.keepOn), now);
      await h.saveNote(note);
      return `Note “${noteTitle(note)}” saved${op.keepOn ? ` ${where(op.keepOn)}` : ''}.`;
    }
    case 'folder-create':
      await h.newFolder(op.name);
      return `Folder “${op.name}” is on the home screen.`;
    case 'file-into':
      await h.fileInto(op.folderId, op.itemId);
      return `Filed into “${r.projects.find((p) => p.id === op.folderId)?.name ?? 'the folder'}”.`;
    case 'trash':
      await h.trash(op.itemId);
      return 'Moved to the Trash. Nothing was deleted; it can be put back from the Trash.';
  }
}
