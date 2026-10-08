/**
 * What the studio assistant can do in Artist OS (Art-Talk-Back D-079). The
 * records live on this device, so the assistant reads them from a snapshot
 * the app sends (`appData`), shows places with `open_in_app` (the app map
 * below), and changes things only through these device actions: each comes
 * back as a confirm card, and on Confirm the app runs it with the same
 * functions its own buttons use. DOM-free; the shell supplies the snapshot
 * and carries out the resolved operation.
 */

export interface SnapshotItem {
  id: string;
  kind: 'commission' | 'invoice' | 'photo' | 'note' | 'folder';
  name: string;
}

export interface Snapshot {
  folders: { id: string; name: string; items: SnapshotItem[] }[];
  /** Loose on the home screen, folders aside. */
  desktop: SnapshotItem[];
  notes: { id: string; title: string; place: string }[];
  /** Dock tools by name, in dock order. */
  tools: string[];
  /** Titles of the windows on screen. */
  open: string[];
}

export type KeepOn = { type: 'desktop' } | { type: 'notes' } | { type: 'folder'; id: string };

export type DeviceOp =
  | { type: 'note-create'; title: string; text: string; checklist: string[]; keepOn: KeepOn }
  | { type: 'note-edit'; id: string; title?: string; text?: string; addItems: string[]; keepOn?: KeepOn }
  | { type: 'folder-create'; name: string }
  | { type: 'file-into'; itemId: string; folderId: string }
  | { type: 'trash'; itemId: string }
  | { type: 'commission-draft'; title: string; clientName: string; clientEmail: string | null; description: string; priceCents: number | null; folderId: string | null }
  | { type: 'invoice-draft'; fromCommissionId: string | null; clientName: string; description: string; amountCents: number | null; folderId: string | null };

const str = { type: 'string', maxLength: 2000 } as const;
const keepOn = {
  type: 'string',
  enum: ['home', 'notes', 'folder'],
  description: '"home" = the home screen (desktop), "notes" = only in the Notes window, "folder" = inside the folder named in folder',
} as const;
const folder = { type: 'string', maxLength: 200, description: 'A folder name exactly as in app_data' } as const;

export const DEVICE_ACTIONS = [
  {
    name: 'note_create',
    description: 'Make a new note (title, text, optional checklist) and keep it on the home screen, in Notes, or in a folder.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200 },
        text: str,
        checklist: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 50 },
        keep_on: keepOn,
        folder,
      },
      required: ['title', 'keep_on'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_edit',
    description: 'Change a note from app_data: its title or text (replaced whole), add checklist items, or move it to the home screen, Notes or a folder.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', maxLength: 60 },
        title: { type: 'string', maxLength: 200 },
        text: str,
        add_items: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 50 },
        keep_on: keepOn,
        folder,
      },
      required: ['note_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'folder_create',
    description: 'Make a new empty folder on the home screen.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', maxLength: 120 } }, required: ['name'], additionalProperties: false },
  },
  {
    name: 'file_into_folder',
    description: 'Put a commission, invoice, picture or note (by its id in app_data) into a folder. Nothing is copied or deleted.',
    inputSchema: {
      type: 'object',
      properties: { item_id: { type: 'string', maxLength: 60 }, folder },
      required: ['item_id', 'folder'],
      additionalProperties: false,
    },
  },
  {
    name: 'move_to_trash',
    description: 'Move a commission, invoice, picture, note or folder (by id) to the Trash. It is not deleted; the artist can put it back. The Trash can never be emptied from here.',
    inputSchema: { type: 'object', properties: { item_id: { type: 'string', maxLength: 60 } }, required: ['item_id'], additionalProperties: false },
  },
  {
    name: 'commission_draft',
    description: 'Start a new commission as a draft (nothing is issued or sent): title, client, what the artwork is, and a price in dollars only if the artist said one. Optionally filed into a folder.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200 },
        client_name: { type: 'string', maxLength: 200 },
        client_email: { type: 'string', maxLength: 200 },
        description: str,
        price: { type: 'number', minimum: 0, maximum: 10000000, description: 'Dollars; leave out if not said' },
        folder,
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'invoice_draft',
    description: 'Start a new invoice as a draft (nothing is issued or sent). Either from a commission (by its id in app_data; its client and lines carry over) or blank with a client, a line and an amount in dollars only if the artist said one. Optionally filed into a folder.',
    inputSchema: {
      type: 'object',
      properties: {
        from_commission_id: { type: 'string', maxLength: 60 },
        client_name: { type: 'string', maxLength: 200 },
        description: { type: 'string', maxLength: 500 },
        amount: { type: 'number', minimum: 0, maximum: 10000000, description: 'Dollars; leave out if not said' },
        folder,
      },
      additionalProperties: false,
    },
  },
] as const;

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => clean(x, 200)).filter(Boolean).slice(0, 50) : [];

export function findFolder(snapshot: Snapshot, name: string): Snapshot['folders'][number] | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  return snapshot.folders.find((f) => f.name.trim().toLowerCase() === want) ?? null;
}

function allItems(snapshot: Snapshot): SnapshotItem[] {
  return [
    ...snapshot.desktop,
    ...snapshot.folders.flatMap((f) => [{ id: f.id, kind: 'folder' as const, name: f.name }, ...f.items]),
    ...snapshot.notes.map((n) => ({ id: n.id, kind: 'note' as const, name: n.title })),
  ];
}

function keepOnOf(input: Record<string, unknown>, snapshot: Snapshot): KeepOn | string | undefined {
  const where = clean(input.keep_on, 10);
  if (!where) return undefined;
  if (where === 'home') return { type: 'desktop' };
  if (where === 'notes') return { type: 'notes' };
  if (where === 'folder') {
    const name = clean(input.folder, 200);
    const found = findFolder(snapshot, name);
    return found ? { type: 'folder', id: found.id } : `There is no folder called “${name}”.`;
  }
  return 'keep_on must be home, notes or folder.';
}

/**
 * Checks a device action against what is on the device now (it may have
 * changed since the card was made) and turns it into one operation, or a
 * plain reason it can't run.
 */
export function resolveAction(
  name: string,
  input: Record<string, unknown>,
  snapshot: Snapshot,
): { ok: true; op: DeviceOp } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  switch (name) {
    case 'note_create': {
      const where = keepOnOf(input, snapshot) ?? { type: 'desktop' as const };
      if (typeof where === 'string') return fail(where);
      const title = clean(input.title, 200);
      const text = clean(input.text, 2000);
      const checklist = list(input.checklist);
      if (!title && !text && !checklist.length) return fail('A note needs a title, some text or a checklist.');
      return { ok: true, op: { type: 'note-create', title, text, checklist, keepOn: where } };
    }
    case 'note_edit': {
      const id = clean(input.note_id, 60);
      if (!snapshot.notes.some((n) => n.id === id)) return fail('That note is no longer here.');
      const where = keepOnOf(input, snapshot);
      if (typeof where === 'string') return fail(where);
      const op: DeviceOp = { type: 'note-edit', id, addItems: list(input.add_items) };
      if (typeof input.title === 'string') op.title = clean(input.title, 200);
      if (typeof input.text === 'string') op.text = clean(input.text, 2000);
      if (where) op.keepOn = where;
      return { ok: true, op };
    }
    case 'folder_create': {
      const folderName = clean(input.name, 120);
      if (!folderName) return fail('A folder needs a name.');
      if (findFolder(snapshot, folderName)) return fail(`There is already a folder called “${folderName}”.`);
      return { ok: true, op: { type: 'folder-create', name: folderName } };
    }
    case 'file_into_folder': {
      const target = findFolder(snapshot, clean(input.folder, 200));
      if (!target) return fail(`There is no folder called “${clean(input.folder, 200)}”.`);
      const item = allItems(snapshot).find((i) => i.id === clean(input.item_id, 60));
      if (!item) return fail('That item is no longer here.');
      if (item.kind === 'folder') return fail('A folder cannot go inside another folder.');
      return { ok: true, op: { type: 'file-into', itemId: item.id, folderId: target.id } };
    }
    case 'move_to_trash': {
      const item = allItems(snapshot).find((i) => i.id === clean(input.item_id, 60));
      if (!item) return fail('That item is no longer here.');
      return { ok: true, op: { type: 'trash', itemId: item.id } };
    }
    case 'commission_draft':
    case 'invoice_draft': {
      let folderId: string | null = null;
      const folderName = clean(input.folder, 200);
      if (folderName) {
        const found = findFolder(snapshot, folderName);
        if (!found) return fail(`There is no folder called “${folderName}”.`);
        folderId = found.id;
      }
      const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null);
      if (name === 'commission_draft') {
        const title = clean(input.title, 200);
        if (!title) return fail('A commission needs a title.');
        const email = clean(input.client_email, 200);
        return { ok: true, op: { type: 'commission-draft', title, clientName: clean(input.client_name, 200), clientEmail: email || null, description: clean(input.description, 2000), priceCents: money(input.price), folderId } };
      }
      const fromId = clean(input.from_commission_id, 60);
      if (fromId && !allItems(snapshot).some((i) => i.id === fromId && i.kind === 'commission')) return fail('That commission is no longer here.');
      return { ok: true, op: { type: 'invoice-draft', fromCommissionId: fromId || null, clientName: clean(input.client_name, 200), description: clean(input.description, 500), amountCents: money(input.amount), folderId } };
    }
    default:
      return fail(`Artist OS has no action called ${name}.`);
  }
}

/** What the assistant sees of the device: data, short, one item per line. */
export function snapshotText(snapshot: Snapshot): string {
  const item = (i: SnapshotItem) => `${i.kind} “${i.name}” (id ${i.id})`;
  const lines = [
    `Open windows: ${snapshot.open.length ? snapshot.open.join(', ') : 'none'}`,
    'Folders:',
    ...(snapshot.folders.length
      ? snapshot.folders.map((f) => `- “${f.name}” (id ${f.id}): ${f.items.length ? f.items.map(item).join('; ') : 'empty'}`)
      : ['- none']),
    'On the home screen:',
    ...(snapshot.desktop.length ? snapshot.desktop.map((i) => `- ${item(i)}`) : ['- nothing loose']),
    'Notes:',
    ...(snapshot.notes.length ? snapshot.notes.map((n) => `- “${n.title}” (id ${n.id}), kept: ${n.place}`) : ['- none']),
  ];
  return lines.join('\n').slice(0, 19000);
}

/** The app map (D-072): places the assistant can show with open_in_app. */
export function appMapText(snapshot: Snapshot): string {
  return [
    `Dock: ${snapshot.tools.join(', ')}`,
    ...(snapshot.folders.length ? [`Folders: ${snapshot.folders.map((f) => f.name).join(', ')}`] : []),
    ...(snapshot.notes.length ? [`Notes: ${snapshot.notes.map((n) => n.title).slice(0, 200).join(', ')}`] : []),
  ].join('\n').slice(0, 14000);
}
