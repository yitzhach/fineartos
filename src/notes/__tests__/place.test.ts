import { describe, expect, it } from 'vitest';
import { createNote, editNote, noteTitle, notesInFolder, notesOnDesktop, placeNote, placeOf, searchNotes } from '../notes';

describe('note titles and places', () => {
  it('uses the title when there is one, else the first line', () => {
    const note = createNote('first line\nsecond');
    expect(noteTitle(note)).toBe('first line');
    expect(noteTitle(editNote(note, { title: '  Studio list ' }))).toBe('Studio list');
    expect(noteTitle(editNote(note, { title: '   ' }))).toBe('first line');
  });

  it('finds a note by its title', () => {
    const note = editNote(createNote('body'), { title: 'Framing quote' });
    expect(searchNotes([note], 'framing')).toEqual([note]);
  });

  it('an older note with no place stays in Notes only', () => {
    const note = createNote('old');
    expect(placeOf(note)).toEqual({ type: 'notes' });
    expect(notesOnDesktop([note])).toEqual([]);
  });

  it('puts a note on the home screen and takes it off', () => {
    const on = placeNote(createNote('x'), { type: 'desktop' });
    expect(placeOf(on)).toEqual({ type: 'desktop' });
    expect(notesOnDesktop([on])).toEqual([on]);
    expect(notesOnDesktop([placeNote(on, { type: 'notes' })])).toEqual([]);
  });

  it('a note in a folder is not on the home screen too', () => {
    const filed = placeNote(placeNote(createNote('x'), { type: 'desktop' }), { type: 'folder', id: 'f1' });
    expect(placeOf(filed)).toEqual({ type: 'folder', id: 'f1' });
    expect(notesOnDesktop([filed])).toEqual([]);
    expect(notesInFolder([filed], 'f1')).toEqual([filed]);
    expect(notesInFolder([filed], 'f2')).toEqual([]);
  });

  it('leaving a folder drops the folder pin but keeps a pin to anything else', () => {
    const filed = placeNote(createNote('x'), { type: 'folder', id: 'f1' });
    expect(placeNote(filed, { type: 'desktop' }).pin).toBeNull();
    const pinned = createNote('x', { kind: 'client', id: 'c1' });
    expect(placeNote(pinned, { type: 'desktop' }).pin).toEqual({ kind: 'client', id: 'c1' });
  });
});
