/**
 * Notes: quick notes and checklists, optionally pinned to a record — a
 * commission, an invoice, a picture, a show, a client. A note pinned to
 * something that has since gone keeps its text and says what it was pinned
 * to is gone; it never disappears with it. DOM-free.
 */
import { newId } from '../commission/document';

export type PinKind = 'commission' | 'invoice' | 'photo' | 'show' | 'client' | 'project';

export interface Pin {
  kind: PinKind;
  id: string;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  /** Optional heading. Older notes have none and title off their first line. */
  title?: string;
  text: string;
  /** Empty for a plain note. */
  checklist: CheckItem[];
  pin: Pin | null;
  /** Shown as an icon on the home screen. Older notes have none: not shown. */
  onDesktop?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createNote(text = '', pin: Pin | null = null, now = new Date()): Note {
  const iso = now.toISOString();
  return { id: newId(), text, checklist: [], pin, createdAt: iso, updatedAt: iso };
}

export function editNote(note: Note, changes: Partial<Note>, now = new Date()): Note {
  return { ...note, ...changes, id: note.id, updatedAt: now.toISOString() };
}

export function addCheckItem(note: Note, text: string, now = new Date()): Note {
  const clean = text.trim();
  if (!clean) return note;
  return editNote(note, { checklist: [...note.checklist, { id: newId(), text: clean, done: false }] }, now);
}

export function toggleCheckItem(note: Note, itemId: string, now = new Date()): Note {
  return editNote(
    note,
    { checklist: note.checklist.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)) },
    now,
  );
}

export function removeCheckItem(note: Note, itemId: string, now = new Date()): Note {
  return editNote(note, { checklist: note.checklist.filter((item) => item.id !== itemId) }, now);
}

/** The title, or the first line, or the first checklist item, or "Empty note". */
export function noteTitle(note: Note): string {
  const titled = note.title?.trim();
  if (titled) return titled.length > 60 ? `${titled.slice(0, 57)}…` : titled;
  const first = note.text.split('\n').map((l) => l.trim()).find(Boolean);
  if (first) return first.length > 60 ? `${first.slice(0, 57)}…` : first;
  const item = note.checklist[0]?.text;
  return item ? `☐ ${item}` : 'Empty note';
}

/** "2 of 5 done", or null for a plain note. */
export function checklistProgress(note: Note): string | null {
  if (note.checklist.length === 0) return null;
  const done = note.checklist.filter((i) => i.done).length;
  return `${done} of ${note.checklist.length} done`;
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => [n.title ?? '', n.text, ...n.checklist.map((i) => i.text)].join(' ').toLowerCase().includes(q));
}

export function notesPinnedTo(notes: Note[], pin: Pin): Note[] {
  return notes.filter((n) => n.pin?.kind === pin.kind && n.pin.id === pin.id);
}

/** Where a note is kept: the Notes window only, the home screen, or a folder. */
export type NotePlace = { type: 'notes' } | { type: 'desktop' } | { type: 'folder'; id: string };

export function placeOf(note: Note): NotePlace {
  if (note.pin?.kind === 'project') return { type: 'folder', id: note.pin.id };
  return note.onDesktop ? { type: 'desktop' } : { type: 'notes' };
}

/**
 * Put a note on the home screen or into a folder. A folder is a pin, so a
 * note in a folder is never on the home screen too; leaving a folder keeps
 * any other pin it never had (a folder pin replaces it).
 */
export function placeNote(note: Note, place: NotePlace, now = new Date()): Note {
  if (place.type === 'folder') return editNote(note, { pin: { kind: 'project', id: place.id }, onDesktop: false }, now);
  const pin = note.pin?.kind === 'project' ? null : note.pin;
  return editNote(note, { pin, onDesktop: place.type === 'desktop' }, now);
}

/** Notes drawn as icons on the home screen. */
export function notesOnDesktop(notes: Note[]): Note[] {
  return notes.filter((n) => n.onDesktop === true && n.pin?.kind !== 'project');
}

/** Notes filed into one folder. */
export function notesInFolder(notes: Note[], folderId: string): Note[] {
  return notes.filter((n) => n.pin?.kind === 'project' && n.pin.id === folderId);
}

/** Newest edit first. */
export const byNoteUpdated = (a: Note, b: Note): number => b.updatedAt.localeCompare(a.updatedAt);

/**
 * Dictation where the browser can listen, and only there (rule 8). Returns
 * the constructor name the UI should use, or null to leave the microphone out.
 */
export function speechSupport(win: Record<string, unknown>): 'SpeechRecognition' | 'webkitSpeechRecognition' | null {
  if (typeof win.SpeechRecognition === 'function') return 'SpeechRecognition';
  if (typeof win.webkitSpeechRecognition === 'function') return 'webkitSpeechRecognition';
  return null;
}
