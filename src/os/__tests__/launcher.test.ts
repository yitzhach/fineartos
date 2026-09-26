import { describe, expect, it } from 'vitest';
import {
  GO_KEYS,
  GO_WINDOW_MS,
  TRY_THESE,
  actionEntries,
  goStep,
  normalise,
  recordEntries,
  searchLauncher,
  suggestions,
  toolEntries,
  type LauncherContext,
  type LauncherEntry,
} from '../launcher';
import { createDocument } from '../../commission/document';
import { createBlankInvoice } from '../../invoice/invoice';
import { createProject } from '../../project/project';
import { createPhoto } from '../../photo/photo';
import { createShow } from '../../shows/shows';
import { emptyPaymentInstructions } from '../../lib/prefs';
import type { StoredDocument } from '../../persistence/repository';
import type { GuestEntry } from '../../connect/guestbook';

const CONTEXT: LauncherContext = {
  frames: 0,
  hasFocused: false,
  compact: false,
  undoLabel: null,
  theme: 'dark',
  fullscreen: 'off',
  autoTile: false,
  snapped: false,
  mac: false,
};

function stored(title: string, client: string, number = 'C-001'): StoredDocument {
  const document = createDocument(number);
  return {
    id: document.id,
    workspaceId: 'local',
    revision: 1,
    document: { ...document, title, client: { ...document.client, name: client } },
    saveState: 'saved-local',
    conflict: null,
  };
}

function guest(name: string, email: string | null, show: string | null = null): GuestEntry {
  return {
    id: `g-${name}`,
    name,
    email,
    phone: null,
    show,
    note: null,
    consented: true,
    likedPhotoIds: [],
    signaturePaths: null,
    signedAt: '2026-09-01T10:00:00.000Z',
  };
}

const ids = (entries: LauncherEntry[]) => entries.map((e) => e.id);
const first = (entries: LauncherEntry[], query: string) => searchLauncher(entries, query)[0]?.id;

describe('finding a tool by what an artist calls it', () => {
  const entries = [...toolEntries(), ...actionEntries(CONTEXT)];

  it('finds a tool by its name, from the first letters', () => {
    expect(first(entries, 'finan')).toBe('tool:finance');
    expect(ids(searchLauncher(entries, 'fin')).slice(0, 2).sort()).toEqual(['tool:finance', 'tool:finder']);
    expect(first(entries, 'Invoices')).toBe('tool:invoices');
    expect(first(entries, 'art')).toBe('tool:artwork');
  });

  it('finds a tool by the other words people use for it', () => {
    expect(first(entries, 'mileage')).toBe('tool:finance');
    expect(first(entries, 'booth')).toBe('tool:shows');
    expect(first(entries, 'catalogue')).toBe('tool:artwork');
    expect(first(entries, 'bin')).toBe('tool:trash');
    expect(ids(searchLauncher(entries, 'qr'))).toContain('tool:connect');
    expect(ids(searchLauncher(entries, 'qr'))).toContain('action:qr');
  });

  it('puts the tool before the action it shares a word with', () => {
    const found = ids(searchLauncher(entries, 'invoice'));
    expect(found.indexOf('tool:invoices')).toBeLessThan(found.indexOf('action:new-invoice'));
  });

  it('narrows with every word typed', () => {
    const one = searchLauncher(entries, 'new');
    const two = searchLauncher(entries, 'new invoice');
    expect(two.length).toBeLessThan(one.length);
    expect(two[0]?.id).toBe('action:new-invoice');
  });

  it('ranks a whole phrase first', () => {
    expect(ids(searchLauncher(entries, 'email list')).slice(0, 2)).toEqual(
      expect.arrayContaining(['action:guest-book', 'tool:connect']),
    );
  });

  it('forgives a missing letter or two', () => {
    expect(first(entries, 'invces')).toBe('tool:invoices');
  });

  it('ignores case, accents and extra spaces', () => {
    expect(normalise('  Café   Gallery ')).toBe('cafe gallery');
    expect(first(entries, '  SHOWS ')).toBe('tool:shows');
  });

  it('returns nothing for an empty box or a word that matches nothing', () => {
    expect(searchLauncher(entries, '   ')).toEqual([]);
    expect(searchLauncher(entries, 'zzzqqq')).toEqual([]);
  });

  it('never says deductible, and never claims to send anything', () => {
    for (const entry of entries) {
      expect(`${entry.title} ${entry.hint}`.toLowerCase()).not.toContain('deductible');
      expect(entry.hint.toLowerCase()).not.toMatch(/\bsent\b|\bsends\b/);
    }
  });
});

describe('shortcuts', () => {
  it('gives every tool in the dock a G sequence, each letter once', () => {
    const tools = toolEntries().filter((t) => t.id !== 'tool:settings');
    for (const tool of tools) expect(tool.keys?.[0]).toBe('G');
    const letters = Object.keys(GO_KEYS);
    expect(new Set(letters).size).toBe(letters.length);
  });

  it('opens a tool on G then its letter', () => {
    const armed = goStep({ armedAt: null }, 'g', 1000);
    expect(armed.consumed).toBe(true);
    const done = goStep(armed.state, 'i', 1400);
    expect(done.tool).toBe('invoices');
    expect(done.state.armedAt).toBeNull();
  });

  it('forgets G after a pause, and lets other keys through', () => {
    const armed = goStep({ armedAt: null }, 'g', 1000);
    const late = goStep(armed.state, 'i', 1000 + GO_WINDOW_MS + 1);
    expect(late.tool).toBeNull();
    expect(late.consumed).toBe(false);
    expect(goStep({ armedAt: null }, 'x', 5).consumed).toBe(false);
  });

  it('takes an unknown second key as not a shortcut at all', () => {
    const armed = goStep({ armedAt: null }, 'g', 1000);
    const other = goStep(armed.state, 'z', 1100);
    expect(other).toEqual({ state: { armedAt: null }, tool: null, consumed: false });
  });

  it('draws modifier keys the way the machine does', () => {
    const pc = actionEntries({ ...CONTEXT, hasFocused: true });
    const mac = actionEntries({ ...CONTEXT, hasFocused: true, mac: true });
    expect(pc.find((e) => e.id === 'action:snap-left')?.keys).toEqual(['Alt', 'Shift', '←']);
    expect(mac.find((e) => e.id === 'action:snap-left')?.keys).toEqual(['⌥', '⇧', '←']);
  });
});

describe('only what can be done now', () => {
  it('offers tiling only with two frames on a screen that has windows', () => {
    expect(ids(actionEntries({ ...CONTEXT, frames: 1 }))).not.toContain('action:tile-columns');
    expect(ids(actionEntries({ ...CONTEXT, frames: 2 }))).toContain('action:tile-columns');
    expect(ids(actionEntries({ ...CONTEXT, frames: 3, compact: true }))).not.toContain('action:tile-grid');
    expect(ids(actionEntries({ ...CONTEXT, compact: true }))).not.toContain('action:auto-tile');
  });

  it('offers snapping only with a window in front', () => {
    expect(ids(actionEntries(CONTEXT))).not.toContain('action:snap-left');
    expect(ids(actionEntries({ ...CONTEXT, hasFocused: true }))).toContain('action:snap-left');
  });

  it('offers Put windows back only when something is snapped', () => {
    expect(ids(actionEntries({ ...CONTEXT, frames: 2 }))).not.toContain('action:untile');
    expect(ids(actionEntries({ ...CONTEXT, frames: 2, snapped: true }))).toContain('action:untile');
  });

  it('names the undo, and leaves it out when there is nothing to undo', () => {
    expect(ids(actionEntries(CONTEXT))).not.toContain('action:undo');
    const undo = actionEntries({ ...CONTEXT, undoLabel: 'Move to Trash' }).find((e) => e.id === 'action:undo');
    expect(undo?.title).toBe('Undo: move to trash');
  });

  it('leaves fullscreen out where the browser has none, and says which way it goes', () => {
    expect(ids(actionEntries({ ...CONTEXT, fullscreen: 'unsupported' }))).not.toContain('action:fullscreen');
    const on = actionEntries({ ...CONTEXT, fullscreen: 'on' }).find((e) => e.id === 'action:fullscreen');
    expect(on?.title).toBe('Leave fullscreen');
  });

  it('says which way the theme and auto-tiling switches go', () => {
    const light = actionEntries({ ...CONTEXT, theme: 'light' });
    expect(light.find((e) => e.id === 'action:theme')?.title).toBe('Switch to dark mode');
    const tiling = actionEntries({ ...CONTEXT, autoTile: true });
    expect(tiling.find((e) => e.id === 'action:auto-tile')?.title).toBe('Turn auto-tiling off');
  });
});

describe('records', () => {
  const doc = stored('Harbour triptych', 'Ana Lima', 'C-014');
  const untitled = stored('', '', 'C-015');
  const invoice = { ...createBlankInvoice('2026-003', emptyPaymentInstructions()), client: { ...doc.document.client } };
  const folder = createProject('Lima commission', null);
  const photo = createPhoto({ imageId: 'img-1', title: 'Blue heron', pixelWidth: 10, pixelHeight: 10 });
  const show = { ...createShow('Spring fair'), venue: 'Town hall', startDate: '2026-10-03' };
  const records = recordEntries({
    documents: [doc, untitled],
    invoices: [invoice],
    projects: [folder],
    photos: [photo],
    shows: [show],
    guests: [guest('Sam Ortiz', 'sam@example.com', 'Spring fair'), guest('Kit', null)],
  });
  const everything = [...toolEntries(), ...actionEntries(CONTEXT), ...records];

  it('finds a commission and its invoice by the client’s name', () => {
    const found = ids(searchLauncher(everything, 'lima'));
    expect(found).toContain(`commission:${doc.id}`);
    expect(found).toContain(`invoice:${invoice.id}`);
    expect(found).toContain(`folder:${folder.id}`);
  });

  it('finds a record by its number', () => {
    expect(first(everything, 'C-014')).toBe(`commission:${doc.id}`);
    expect(first(everything, '2026-003')).toBe(`invoice:${invoice.id}`);
  });

  it('finds a guest by name or email, and a show by its venue', () => {
    expect(first(everything, 'ortiz')).toBe('guest:g-Sam Ortiz');
    expect(first(everything, 'sam@example')).toBe('guest:g-Sam Ortiz');
    expect(ids(searchLauncher(everything, 'town hall'))).toContain(`show:${show.id}`);
  });

  it('says what is missing rather than inventing it', () => {
    const blank = records.find((r) => r.id === `commission:${untitled.id}`)!;
    expect(blank.title).toBe('Untitled document');
    expect(blank.hint).toContain('No client named');
    const kit = records.find((r) => r.id === 'guest:g-Kit')!;
    expect(kit.hint).toBe('No contact details');
    const noDate = recordEntries({ ...emptyRecords(), shows: [createShow('Pop-up')] })[0]!;
    expect(noDate.hint).toBe('No venue set · No date set');
  });

  it('keeps the tools above records when both match well', () => {
    const withShowRecord = [...everything];
    const found = ids(searchLauncher(withShowRecord, 'show'));
    expect(found[0]).toBe('tool:shows');
  });

  it('counts the items in a folder in words', () => {
    const entry = records.find((r) => r.id === `folder:${folder.id}`)!;
    expect(entry.hint).toBe('Project folder · 0 items');
  });
});

describe('the empty box', () => {
  it('only suggests words that find something', () => {
    const entries = [...toolEntries(), ...actionEntries({ ...CONTEXT, compact: true })];
    for (const word of TRY_THESE) expect(searchLauncher(entries, word).length).toBeGreaterThan(0);
  });

  it('shows the tools first, then the things done most', () => {
    const list = suggestions([...toolEntries(), ...actionEntries({ ...CONTEXT, frames: 2 })]);
    expect(list[0]?.section).toBe('tool');
    expect(list.some((e) => e.id === 'action:new-commission')).toBe(true);
    expect(list.some((e) => e.id === 'action:tile-columns')).toBe(true);
    const lastTool = list.map((e) => e.section).lastIndexOf('tool');
    expect(list.findIndex((e) => e.section === 'action')).toBeGreaterThan(lastTool);
  });
});

function emptyRecords() {
  return { documents: [], invoices: [], projects: [], photos: [], shows: [], guests: [] };
}
