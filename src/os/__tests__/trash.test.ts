import { describe, expect, it } from 'vitest';
import {
  attachedIds,
  countPhrase,
  deletionTargets,
  describeWhen,
  findEntry,
  orphanImageIds,
  removeEntry,
  summarise,
  trashItem,
  trashedIds,
  type Trash,
  type TrashEntry,
} from '../trash';

function entry(over: Partial<TrashEntry> = {}): TrashEntry {
  return {
    id: 'doc-1',
    kind: 'document',
    name: 'Harbour triptych',
    deletedAt: '2026-09-11T12:00:00.000Z',
    contains: [],
    fromFolderId: null,
    ...over,
  };
}

describe('trashItem', () => {
  it('puts the newest thing on top', () => {
    const trash = trashItem(trashItem([], entry({ id: 'a' })), entry({ id: 'b' }));
    expect(trash.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('never lists the same record twice', () => {
    const trash = trashItem(trashItem([], entry({ id: 'a', name: 'Old' })), entry({ id: 'a', name: 'New' }));
    expect(trash).toHaveLength(1);
    expect(trash[0]!.name).toBe('New');
  });
});

describe('restoring', () => {
  const trash: Trash = [entry({ id: 'a' }), entry({ id: 'b' })];

  it('finds the entry being put back, with where it came from', () => {
    const found = findEntry([entry({ id: 'a', fromFolderId: 'folder-1' })], 'a');
    expect(found?.fromFolderId).toBe('folder-1');
  });

  it('reports nothing for a record that was never thrown away', () => {
    expect(findEntry(trash, 'ghost')).toBeNull();
  });

  it('takes only that entry out', () => {
    expect(removeEntry(trash, 'a').map((e) => e.id)).toEqual(['b']);
  });
});

describe('trashedIds', () => {
  it('hides the contents of a binned folder too', () => {
    const ids = trashedIds([entry({ id: 'folder-1', kind: 'project', contains: ['doc-1', 'inv-1'] })]);
    expect([...ids].sort()).toEqual(['doc-1', 'folder-1', 'inv-1']);
  });

  it('is empty for an empty trash', () => {
    expect(trashedIds([]).size).toBe(0);
  });
});

describe('summarise', () => {
  it('counts the records inside a folder, not just the folder', () => {
    const summary = summarise([
      entry({ id: 'folder-1', kind: 'project', contains: ['doc-1', 'doc-2'] }),
      entry({ id: 'inv-9', kind: 'invoice' }),
    ]);
    expect(summary.entries).toBe(2);
    // The number the confirmation quotes: 1 folder + its 2 items + 1 invoice.
    expect(summary.records).toBe(4);
    expect(summary.folders).toBe(1);
    expect(summary.invoices).toBe(1);
  });

  it('counts nothing when the trash is empty', () => {
    expect(summarise([]).records).toBe(0);
  });
});

describe('deletionTargets', () => {
  it('destroys a folder together with what is inside it', () => {
    expect(deletionTargets(entry({ id: 'f', kind: 'project', contains: ['a', 'b'] }))).toEqual(['f', 'a', 'b']);
  });
});

describe('countPhrase', () => {
  it('says item for one and items for more', () => {
    expect(countPhrase(1)).toBe('1 item');
    expect(countPhrase(3)).toBe('3 items');
    expect(countPhrase(0)).toBe('0 items');
  });
});

describe('describeWhen', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');

  it('says just now for something thrown away a moment ago', () => {
    expect(describeWhen('2026-09-11T11:59:40.000Z', now)).toBe('Just now');
  });

  it('counts minutes, hours and days', () => {
    expect(describeWhen('2026-09-11T11:30:00.000Z', now)).toBe('30 minutes ago');
    expect(describeWhen('2026-09-11T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(describeWhen('2026-09-09T12:00:00.000Z', now)).toBe('2 days ago');
  });

  it('says so rather than inventing a date it cannot read', () => {
    expect(describeWhen('not a date', now)).toBe('Unknown');
  });
});

describe('orphanImageIds', () => {
  it('keeps a picture another commission is still using', () => {
    expect(orphanImageIds(['img-1', 'img-2'], ['img-2'])).toEqual(['img-1']);
  });

  it('lists each picture once', () => {
    expect(orphanImageIds(['img-1', 'img-1'], [])).toEqual(['img-1']);
  });

  it('keeps nothing when nothing was removed', () => {
    expect(orphanImageIds([], ['img-1'])).toEqual([]);
  });
});

describe('attachedIds', () => {
  const updates = [
    { id: 'u1', documentId: 'doc-1' },
    { id: 'u2', documentId: 'doc-1' },
    { id: 'u3', documentId: 'doc-2' },
  ];

  it('takes the updates of a commission that is going', () => {
    expect(attachedIds(['doc-1'], updates)).toEqual(['u1', 'u2']);
  });

  it('takes the updates of a commission filed inside a folder', () => {
    const targets = deletionTargets(entry({ id: 'f', kind: 'project', contains: ['doc-2'] }));
    expect(attachedIds(targets, updates)).toEqual(['u3']);
  });

  it('leaves every other commission\u2019s updates alone', () => {
    expect(attachedIds(['doc-9'], updates)).toEqual([]);
  });

  it('counts them in the total the confirmation quotes', () => {
    const summary = summarise([entry({ id: 'doc-1' })], updates);
    expect(summary.updates).toBe(2);
    expect(summary.records).toBe(3); // the commission and its two updates
  });

  it('still counts nothing when no updates are passed', () => {
    expect(summarise([entry({ id: 'doc-1' })]).records).toBe(1);
  });
});
