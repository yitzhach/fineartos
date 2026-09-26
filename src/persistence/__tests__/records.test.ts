import { describe, expect, it } from 'vitest';
import {
  byCreated,
  byDocumentUpdated,
  byUpdated,
  emptyRecords,
  imageIdsKey,
  outOfTrash,
  removeRecord,
  upsertRecord,
  updatesInSight,
  visibleRecords,
  withImageIds,
} from '../records';
import { createDocument } from '../../commission/document';
import { createPhoto, editPhoto } from '../../photo/photo';
import { createProject } from '../../project/project';
import type { StoredDocument } from '../repository';

const stamped = (id: string, updatedAt: string) => ({ id, updatedAt });

function storedDoc(id: string, updatedAt: string): StoredDocument {
  const doc = { ...createDocument('CS-2026-001'), id, updatedAt };
  return { id, workspaceId: 'local', revision: 1, document: doc, saveState: 'saved-local', conflict: null };
}

describe('one record into a list', () => {
  it('replaces a record where it was, and keeps the store order', () => {
    const list = [stamped('a', '2026-03-01'), stamped('b', '2026-02-01'), stamped('c', '2026-01-01')];
    const next = upsertRecord(list, stamped('c', '2026-04-01'), byUpdated);
    expect(next.map((one) => one.id)).toEqual(['c', 'a', 'b']);
    // The list handed in is left alone.
    expect(list.map((one) => one.id)).toEqual(['a', 'b', 'c']);
  });

  it('adds a new record in its place', () => {
    const list = [stamped('a', '2026-03-01'), stamped('b', '2026-01-01')];
    expect(upsertRecord(list, stamped('n', '2026-02-01'), byUpdated).map((one) => one.id)).toEqual([
      'a',
      'n',
      'b',
    ]);
  });

  it('keeps an edit that does not move a record where it was', () => {
    const list = [stamped('a', '2026-03-01'), stamped('b', '2026-01-01')];
    const edited = { ...stamped('b', '2026-01-01'), title: 'Renamed' };
    const next = upsertRecord<{ id: string; updatedAt: string; title?: string }>(list, edited, byUpdated);
    expect(next[1]).toBe(edited);
    expect(next).toHaveLength(2);
  });

  it('sorts commissions by their document, newest first', () => {
    const list = [storedDoc('a', '2026-02-01T00:00:00Z'), storedDoc('b', '2026-01-01T00:00:00Z')];
    const next = upsertRecord(list, storedDoc('b', '2026-05-01T00:00:00Z'), byDocumentUpdated);
    expect(next.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('orders by creation where the store does', () => {
    const list = [{ id: 'x', createdAt: '2026-01-02' }];
    expect(upsertRecord(list, { id: 'y', createdAt: '2026-01-03' }, byCreated)[0]?.id).toBe('y');
  });

  it('removes a record, and hands back the same list when it was not there', () => {
    const list = [stamped('a', '1'), stamped('b', '2')];
    expect(removeRecord(list, 'a').map((one) => one.id)).toEqual(['b']);
    expect(removeRecord(list, 'zzz')).toBe(list);
  });
});

describe('what is on show', () => {
  it('hides what is in the Trash but never the books', () => {
    const photo = createPhoto({ imageId: 'img', title: 'Pear', pixelWidth: 10, pixelHeight: 10 });
    const records = {
      ...emptyRecords(),
      documents: [storedDoc('d1', '2026-01-01'), storedDoc('d2', '2026-01-02')],
      photos: [photo],
      updates: [
        { id: 'u1', documentId: 'd1' },
        { id: 'u2', documentId: 'd2' },
      ] as never[],
      expenses: [{ id: 'e1' }] as never[],
    };
    const hidden = new Set(['d1', photo.id]);
    const visible = visibleRecords(records, hidden);
    expect(visible.documents.map((row) => row.id)).toEqual(['d2']);
    expect(visible.photos).toEqual([]);
    // An update goes out of sight with its commission.
    expect(visible.updates.map((u) => u.id)).toEqual(['u2']);
    expect(visible.expenses).toHaveLength(1);
    expect(outOfTrash(records.documents, new Set())).toHaveLength(2);
    expect(updatesInSight(records.updates, new Set(['d2'])).map((u) => u.id)).toEqual(['u1']);
  });

  it('fills in the image list an old folder was saved without', () => {
    const folder = { ...createProject('Old', null), imageIds: undefined };
    expect(withImageIds(folder).imageIds).toEqual([]);
  });
});

describe('the images in use', () => {
  it('names every picture once, sorted, including the photograph under an edit', () => {
    const photo = editPhoto(createPhoto({ imageId: 'edit', title: 'P', pixelWidth: 1, pixelHeight: 1 }), {
      originalImageId: 'original',
    });
    const doc = storedDoc('d', '2026-01-01');
    doc.document.artwork.referenceImageIds = ['ref', 'edit'];
    const key = imageIdsKey({
      documents: [doc],
      projects: [{ ...createProject('F', null), coverImageId: 'cover' }],
      photos: [photo],
      expenses: [{ receiptImageIds: ['receipt'] }] as never[],
    });
    expect(key).toBe('cover,edit,original,receipt,ref');
  });

  it('is empty for an empty studio', () => {
    expect(imageIdsKey({ documents: [], projects: [], photos: [], expenses: [] })).toBe('');
  });
});
