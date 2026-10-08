import { describe, expect, it, vi } from 'vitest';
import { createNote, placeNote } from '../../notes/notes';
import { buildSnapshot, runOp, type StudioRecords } from '../snapshot';

const folder = { id: 'f1', name: 'Harbour', clientName: null, documentIds: ['d1'], invoiceIds: [], imageIds: [], coverImageId: null } as unknown as StudioRecords['projects'][number];
const filedNote = { ...placeNote(createNote('Glass'), { type: 'folder', id: 'f1' }), id: 'n1' };
const homeNote = { ...placeNote(createNote('Call Ana'), { type: 'desktop' }), id: 'n2' };
const records: StudioRecords = {
  projects: [folder],
  documents: [
    { id: 'd1', title: 'Harbour triptych', documentNumber: 'C-1', archived: false },
    { id: 'd2', title: '', documentNumber: 'C-2', archived: false },
    { id: 'd3', title: 'Old', documentNumber: 'C-3', archived: true },
  ],
  invoices: [{ id: 'i1', invoiceNumber: 'INV-1' }],
  photos: [],
  notes: [filedNote, homeNote],
  tools: ['Home', 'Notes'],
  open: [],
};

describe('the assistant snapshot', () => {
  it('lists folders with their contents and what is loose on the home screen', () => {
    const snap = buildSnapshot(records);
    expect(snap.folders[0]!.items.map((i) => i.name)).toEqual(['Harbour triptych', 'Glass']);
    expect(snap.desktop.map((i) => i.name)).toEqual(['C-2', 'INV-1', 'Call Ana']);
    expect(snap.notes.map((n) => n.place)).toEqual(['folder “Harbour”', 'home screen']);
  });
});

describe('running a confirmed operation', () => {
  const handlers = () => ({ saveNote: vi.fn(async (_note: unknown) => {}), newFolder: vi.fn(async (_name: string) => {}), fileInto: vi.fn(async (_f: string, _i: string) => {}), trash: vi.fn((_id: string) => {}) });

  it('creates a titled note with a checklist in a folder', async () => {
    const h = handlers();
    const line = await runOp({ type: 'note-create', title: 'Framing quote', text: 'ask', checklist: ['measure'], keepOn: { type: 'folder', id: 'f1' } }, records, h);
    const saved = h.saveNote.mock.calls[0]![0] as any;
    expect(saved).toMatchObject({ title: 'Framing quote', text: 'ask', pin: { kind: 'project', id: 'f1' }, onDesktop: false });
    expect(saved.checklist.map((c: any) => c.text)).toEqual(['measure']);
    expect(line).toBe('Note “Framing quote” saved in the folder “Harbour”.');
  });

  it('edits a note and moves it home; files, makes folders and trashes through the shell', async () => {
    const h = handlers();
    await runOp({ type: 'note-edit', id: 'n1', title: 'Museum glass', addItems: ['call'], keepOn: { type: 'desktop' } }, records, h);
    expect(h.saveNote.mock.calls[0]![0]).toMatchObject({ id: 'n1', title: 'Museum glass', pin: null, onDesktop: true });
    await runOp({ type: 'folder-create', name: 'Spring' }, records, h);
    await runOp({ type: 'file-into', itemId: 'i1', folderId: 'f1' }, records, h);
    await runOp({ type: 'trash', itemId: 'd2' }, records, h);
    expect(h.newFolder).toHaveBeenCalledWith('Spring');
    expect(h.fileInto).toHaveBeenCalledWith('f1', 'i1');
    expect(h.trash).toHaveBeenCalledWith('d2');
  });
});
