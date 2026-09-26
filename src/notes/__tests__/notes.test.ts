import { describe, expect, it } from 'vitest';
import {
  addCheckItem,
  checklistProgress,
  createNote,
  noteTitle,
  notesPinnedTo,
  removeCheckItem,
  searchNotes,
  speechSupport,
  toggleCheckItem,
} from '../notes';

describe('notes', () => {
  it('titles a note by its first line, or its first item', () => {
    expect(noteTitle(createNote('\n  Call the framer \nabout glass'))).toBe('Call the framer');
    expect(noteTitle(addCheckItem(createNote(), 'Varnish'))).toBe('☐ Varnish');
    expect(noteTitle(createNote())).toBe('Empty note');
  });

  it('keeps a checklist and says how far it has got', () => {
    let note = addCheckItem(addCheckItem(createNote('Show prep'), 'Labels'), '  ');
    note = addCheckItem(note, 'Float');
    expect(note.checklist).toHaveLength(2);
    note = toggleCheckItem(note, note.checklist[0]!.id);
    expect(checklistProgress(note)).toBe('1 of 2 done');
    note = removeCheckItem(note, note.checklist[1]!.id);
    expect(checklistProgress(note)).toBe('1 of 1 done');
    expect(checklistProgress(createNote('plain'))).toBeNull();
  });

  it('finds notes by text and by checklist, and by what they are pinned to', () => {
    const a = createNote('Glass quote', { kind: 'commission', id: 'd1' });
    const b = addCheckItem(createNote(''), 'Buy wire');
    expect(searchNotes([a, b], 'wire')).toEqual([b]);
    expect(notesPinnedTo([a, b], { kind: 'commission', id: 'd1' })).toEqual([a]);
  });

  it('offers dictation only where the browser can listen', () => {
    expect(speechSupport({})).toBeNull();
    expect(speechSupport({ webkitSpeechRecognition: function () {} })).toBe('webkitSpeechRecognition');
  });
});
