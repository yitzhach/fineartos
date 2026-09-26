import { describe, expect, it } from 'vitest';
import { openingWindows } from '../startup';
import { closeWindowsOnto, openWindow, subjectIdOf, type WindowKind, type WindowState } from '../windows';
import { emptyRecords, type StudioRecords } from '../../persistence/records';
import { createDocument } from '../../commission/document';
import type { StoredDocument } from '../../persistence/repository';

const VIEW = { width: 1512, height: 945 };

function openAll(kinds: WindowKind[]): WindowState[] {
  return kinds.reduce<WindowState[]>((windows, kind) => openWindow(windows, { kind, title: 'W' }, VIEW).windows, []);
}

function stored(id: string, number: string): StoredDocument {
  const doc = { ...createDocument(number), id };
  return { id, workspaceId: 'local', revision: 1, document: doc, saveState: 'saved-local', conflict: null };
}

/** Newest first, the way the repository lists them. */
const studio: StudioRecords = {
  ...emptyRecords(),
  documents: [stored('new', 'CS-2026-002'), stored('old', 'CS-2026-001')],
};

describe('what the desktop opens with', () => {
  it('puts back the windows that were open, and nothing on top of them', () => {
    const saved = openAll([{ type: 'settings' }, { type: 'commission', docId: 'old' }]);
    const opening = openingWindows({ restoreOn: true, saved, records: studio, hidden: new Set() });
    expect(opening.kind).toBe('restore');
    if (opening.kind !== 'restore') return;
    expect(opening.windows.map((w) => w.kind.type)).toEqual(['settings', 'commission']);
  });

  it('opens the newest commission when nothing was open', () => {
    expect(openingWindows({ restoreOn: true, saved: [], records: studio, hidden: new Set() })).toEqual({
      kind: 'newest',
      docId: 'new',
      documentNumber: 'CS-2026-002',
    });
  });

  it('opens the newest commission when every saved window pointed at something gone', () => {
    const saved = openAll([{ type: 'commission', docId: 'deleted' }, { type: 'photo', photoId: 'nope' }]);
    expect(openingWindows({ restoreOn: true, saved, records: studio, hidden: new Set() }).kind).toBe('newest');
  });

  it('does not reopen a window onto something in the Trash', () => {
    const saved = openAll([{ type: 'commission', docId: 'new' }]);
    const opening = openingWindows({ restoreOn: true, saved, records: studio, hidden: new Set(['new']) });
    // …and the newest commission not in the Trash opens instead.
    expect(opening).toEqual({ kind: 'newest', docId: 'old', documentNumber: 'CS-2026-001' });
  });

  it('ignores what was saved when reopening is turned off', () => {
    const saved = openAll([{ type: 'settings' }]);
    expect(openingWindows({ restoreOn: false, saved, records: studio, hidden: new Set() }).kind).toBe('newest');
  });

  it('opens nothing in an empty studio', () => {
    expect(openingWindows({ restoreOn: true, saved: null, records: emptyRecords(), hidden: new Set() })).toEqual({
      kind: 'nothing',
    });
  });
});

describe('windows onto records', () => {
  it('names the record behind a window, and none for a tool', () => {
    expect(subjectIdOf({ type: 'invoice', invoiceId: 'i' })).toBe('i');
    expect(subjectIdOf({ type: 'photoEdit', photoId: 'p' })).toBe('p');
    expect(subjectIdOf({ type: 'tool', tool: 'finder' })).toBeNull();
  });

  it('closes every window onto a record that went, and leaves the rest', () => {
    const windows = openAll([
      { type: 'commission', docId: 'a' },
      { type: 'photo', photoId: 'p' },
      { type: 'photoEdit', photoId: 'p' },
      { type: 'folder', projectId: 'f' },
      { type: 'settings' },
    ]);
    const left = closeWindowsOnto(windows, ['p', 'f']);
    expect(left.map((w) => w.kind.type)).toEqual(['commission', 'settings']);
  });
});
