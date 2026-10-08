import { describe, expect, it } from 'vitest';
import { DEVICE_ACTIONS, appMapText, resolveAction, snapshotText, type Snapshot } from '../actions';
import { sseReader } from '../sse';
import { readStudioSession, writeStudioSession } from '../session';

const snap: Snapshot = {
  folders: [{ id: 'f1', name: 'Harbour', items: [{ id: 'd1', kind: 'commission', name: 'Harbour triptych' }] }],
  desktop: [{ id: 'i1', kind: 'invoice', name: 'INV-001' }],
  notes: [{ id: 'n1', title: 'Framing', place: 'home screen' }],
  tools: ['Home', 'Notes', 'Finance'],
  open: ['Notes'],
};

describe('device actions', () => {
  it('declares valid tool names and object schemas', () => {
    for (const a of DEVICE_ACTIONS) {
      expect(a.name).toMatch(/^[a-z][a-z_]{0,39}$/);
      expect(a.inputSchema.type).toBe('object');
      expect(JSON.stringify(a.inputSchema).length).toBeLessThan(4000);
    }
  });

  it('makes a note in a folder named any case', () => {
    expect(resolveAction('note_create', { title: 'Quote', keep_on: 'folder', folder: 'harbour' }, snap)).toEqual({
      ok: true, op: { type: 'note-create', title: 'Quote', text: '', checklist: [], keepOn: { type: 'folder', id: 'f1' } },
    });
  });

  it('defaults a new note to the home screen; refuses an empty one or an unknown folder', () => {
    const r = resolveAction('note_create', { title: 'x' }, snap);
    expect(r.ok && r.op.type === 'note-create' && r.op.keepOn).toEqual({ type: 'desktop' });
    expect(resolveAction('note_create', { title: ' ' }, snap).ok).toBe(false);
    expect(resolveAction('note_create', { title: 'x', keep_on: 'folder', folder: 'Nope' }, snap)).toEqual({ ok: false, message: 'There is no folder called “Nope”.' });
  });

  it('edits only a note that is still there', () => {
    expect(resolveAction('note_edit', { note_id: 'gone' }, snap).ok).toBe(false);
    expect(resolveAction('note_edit', { note_id: 'n1', add_items: ['a', ''], keep_on: 'notes' }, snap)).toEqual({
      ok: true, op: { type: 'note-edit', id: 'n1', addItems: ['a'], keepOn: { type: 'notes' } },
    });
  });

  it('files items but never a folder into a folder; refuses a duplicate folder name', () => {
    expect(resolveAction('file_into_folder', { item_id: 'i1', folder: 'Harbour' }, snap)).toEqual({ ok: true, op: { type: 'file-into', itemId: 'i1', folderId: 'f1' } });
    expect(resolveAction('file_into_folder', { item_id: 'f1', folder: 'Harbour' }, snap).ok).toBe(false);
    expect(resolveAction('folder_create', { name: 'HARBOUR' }, snap).ok).toBe(false);
    expect(resolveAction('folder_create', { name: 'Spring' }, snap)).toEqual({ ok: true, op: { type: 'folder-create', name: 'Spring' } });
  });

  it('trashes only what exists; nothing empties the Trash', () => {
    expect(resolveAction('move_to_trash', { item_id: 'd1' }, snap)).toEqual({ ok: true, op: { type: 'trash', itemId: 'd1' } });
    expect(resolveAction('empty_trash', {}, snap).ok).toBe(false);
  });

  it('starts drafts: price only when said, folder and commission must exist', () => {
    expect(resolveAction('commission_draft', { title: 'Mural', client_name: 'Ana', price: 1200.5, folder: 'harbour' }, snap)).toEqual({
      ok: true, op: { type: 'commission-draft', title: 'Mural', clientName: 'Ana', clientEmail: null, description: '', priceCents: 120050, folderId: 'f1' },
    });
    const r = resolveAction('commission_draft', { title: 'Mural' }, snap);
    expect(r.ok && r.op.type === 'commission-draft' && r.op.priceCents).toBeNull();
    expect(resolveAction('commission_draft', { title: ' ' }, snap).ok).toBe(false);
    expect(resolveAction('invoice_draft', { from_commission_id: 'd1' }, snap)).toEqual({
      ok: true, op: { type: 'invoice-draft', fromCommissionId: 'd1', clientName: '', description: '', amountCents: null, folderId: null },
    });
    expect(resolveAction('invoice_draft', { from_commission_id: 'i1' }, snap).ok).toBe(false);
    expect(resolveAction('invoice_draft', { amount: 50, folder: 'Nope' }, snap).ok).toBe(false);
  });

  it('describes the device and its map', () => {
    const text = snapshotText(snap);
    expect(text).toContain('“Harbour” (id f1): commission “Harbour triptych” (id d1)');
    expect(text).toContain('invoice “INV-001” (id i1)');
    expect(appMapText(snap)).toBe('Dock: Home, Notes, Finance\nFolders: Harbour\nNotes: Framing');
  });
});

describe('sse and session', () => {
  it('splits events across chunks', () => {
    const read = sseReader();
    expect(read('event: text\ndata: {"type":"te')).toEqual([]);
    expect(read('xt","text":"hi"}\n\nevent: end\ndata: {"type":"end"}\n\n')).toEqual([{ type: 'text', text: 'hi' }, { type: 'end' }]);
  });

  it('keeps only an email hint', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(readStudioSession(storage)).toBeNull();
    writeStudioSession({ email: 'a@b.c' }, storage);
    expect(readStudioSession(storage)).toEqual({ email: 'a@b.c' });
    writeStudioSession(null, storage);
    expect(readStudioSession(storage)).toBeNull();
  });
});
