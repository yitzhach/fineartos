/**
 * The launcher: one box that finds a tool, an action or a record by what the
 * artist would call it.
 *
 * DOM-free and tested. The shell hands it what exists — the tools, what can
 * be done right now, the studio's records — and draws whatever it ranks.
 *
 * The rules:
 *  - Every word typed has to match somewhere, so another word narrows.
 *  - A tool is found by the words people use for it, not only its name:
 *    "qr" finds Connect, "mileage" finds Finance, "booth" finds Shows.
 *  - Tools and actions rank above records when both match well: the box is
 *    for getting somewhere first and finding something second.
 *  - Nothing is offered that cannot be done. Tiling needs two windows, so
 *    with one open it is not in the list — not shown and then refused.
 *  - Every tool shows its shortcut, which is how the shortcuts are learned.
 */

import type { StoredDocument } from '../persistence/repository';
import type { Invoice } from '../invoice/types';
import type { Project } from '../project/project';
import { projectItemCount } from '../project/project';
import type { Photo } from '../photo/photo';
import { describePhoto } from '../photo/photo';
import type { Show } from '../shows/shows';
import type { GuestEntry } from '../connect/guestbook';
import { keyNames } from './keys';

export type LauncherSection = 'tool' | 'action' | 'record';

export interface LauncherEntry {
  /** Unique in the list. What the shell switches on when one is chosen. */
  id: string;
  section: LauncherSection;
  title: string;
  /** One line under the title: what it is, or what choosing it will do. */
  hint: string;
  /** The word on the right: "Tool", "Invoice", "Show". */
  label: string;
  /** Other words that find it. Never shown. */
  keywords?: string[];
  /** Keys that do the same thing, drawn as key caps: ['G', 'I']. */
  keys?: string[];
  /** Offered in the empty box, before anything is typed. */
  suggested?: boolean;
}

/**
 * Two-key shortcuts for the tools: G, then the letter. The letter is the
 * tool's initial wherever that is free; Finance is B for the books, because
 * F was already the Finder.
 */
export const GO_KEYS: Record<string, string> = {
  p: 'commissions',
  i: 'invoices',
  f: 'finder',
  c: 'connect',
  a: 'artwork',
  s: 'shows',
  b: 'finance',
  t: 'trash',
  h: 'home',
};

/** Each G sequence and the tool it opens, for the shortcut sheet. */
export function goSequences(): { letter: string; tool: string; title: string }[] {
  return Object.entries(GO_KEYS).map(([letter, tool]) => ({
    letter: letter.toUpperCase(),
    tool,
    title: TOOL_SPECS.find((spec) => spec.id === tool)?.title ?? tool,
  }));
}

function goKeysFor(tool: string): string[] | undefined {
  const letter = Object.keys(GO_KEYS).find((key) => GO_KEYS[key] === tool);
  return letter ? ['G', letter.toUpperCase()] : undefined;
}

interface ToolSpec {
  id: string;
  title: string;
  hint: string;
  keywords: string[];
}

/** The tools, in dock order. Ids are the dock's, so the shell opens them the same way. */
const TOOL_SPECS: ToolSpec[] = [
  {
    id: 'commissions',
    title: 'Projects',
    hint: 'Every commission: client, piece, price and stage',
    keywords: ['commissions', 'commission', 'clients', 'client', 'jobs', 'orders', 'quotes', 'proposals', 'agreements', 'contracts', 'documents', 'work'],
  },
  {
    id: 'invoices',
    title: 'Invoices',
    hint: 'Bills, payments received and what is still owed',
    keywords: ['bill', 'bills', 'billing', 'payments', 'paid', 'owed', 'owing', 'deposit', 'money', 'square', 'venmo'],
  },
  {
    id: 'finder',
    title: 'Finder',
    hint: 'Everything in the studio, in one list',
    keywords: ['files', 'browse', 'all', 'everything', 'documents', 'folders'],
  },
  {
    id: 'connect',
    title: 'Connect',
    hint: 'Guest book, sending a picture, QR and contact card',
    keywords: ['qr', 'qr code', 'guest book', 'guestbook', 'email list', 'mailing list', 'newsletter', 'subscribers', 'contacts', 'visitors', 'leads', 'collectors', 'sign up', 'website', 'contact card', 'share', 'text', 'email'],
  },
  {
    id: 'artwork',
    title: 'Artwork',
    hint: 'The catalogue: pieces, sizes, prices and where each one is',
    keywords: ['catalogue', 'catalog', 'inventory', 'pieces', 'paintings', 'works', 'portfolio', 'stock', 'available', 'sold', 'sales', 'pictures', 'photos'],
  },
  {
    id: 'shows',
    title: 'Shows',
    hint: 'Fairs, openings and markets: deadlines, booth fees, pieces taken',
    keywords: ['fair', 'fairs', 'exhibition', 'exhibitions', 'market', 'markets', 'booth', 'booth fee', 'event', 'events', 'opening', 'gallery', 'deadline', 'application', 'apply', 'calendar'],
  },
  {
    id: 'finance',
    title: 'Finance',
    hint: 'Expenses, receipts, mileage, income and profit and loss',
    keywords: ['money', 'books', 'bookkeeping', 'accounts', 'expenses', 'expense', 'receipts', 'receipt', 'mileage', 'miles', 'profit', 'loss', 'p&l', 'income', 'spending', 'accountant', 'tax', 'csv', 'statement'],
  },
  {
    id: 'trash',
    title: 'Trash',
    hint: 'Things put away. Nothing is deleted until it is emptied',
    keywords: ['bin', 'deleted', 'delete', 'recycle', 'removed', 'put back', 'restore'],
  },
  {
    id: 'home',
    title: 'Home',
    hint: 'Show the desktop: every window goes to the tray, nothing closes',
    keywords: ['desktop', 'show desktop', 'minimise all', 'minimize all', 'hide windows'],
  },
  {
    id: 'settings',
    title: 'Settings',
    hint: 'Studio details, how clients pay you, desktop picture',
    keywords: ['preferences', 'options', 'studio', 'wallpaper', 'background', 'payment instructions', 'mileage rate', 'signature', 'windows'],
  },
];

export function toolEntries(): LauncherEntry[] {
  return TOOL_SPECS.map((spec) => ({
    id: `tool:${spec.id}`,
    section: 'tool',
    title: spec.title,
    hint: spec.hint,
    label: 'Tool',
    keywords: spec.keywords,
    keys: goKeysFor(spec.id),
    suggested: true,
  }));
}

/** What the shell knows about right now, which decides what can be offered. */
export interface LauncherContext {
  /** Frames on screen; a group of tabs counts once. */
  frames: number;
  /** A window is in front, so there is something to snap. */
  hasFocused: boolean;
  /** A phone: windows are sheets, and there is nothing to tile. */
  compact: boolean;
  undoLabel: string | null;
  theme: 'light' | 'dark';
  fullscreen: 'unsupported' | 'off' | 'on';
  autoTile: boolean;
  /** Some window is snapped, tiled or zoomed, so there is something to put back. */
  snapped: boolean;
  /** Draw modifier keys the Mac way. */
  mac: boolean;
}

/** The actions that can be done now, and only those. */
export function actionEntries(context: LauncherContext): LauncherEntry[] {
  const { alt, shift, mod } = keyNames(context.mac);
  const tiling = !context.compact;
  const out: LauncherEntry[] = [];
  const add = (entry: Omit<LauncherEntry, 'section' | 'label'>, when = true) => {
    if (when) out.push({ ...entry, section: 'action', label: 'Action' });
  };

  add({
    id: 'action:new-commission',
    title: 'New commission',
    hint: 'Start a commission: client, piece, price and stages',
    keywords: ['new', 'create', 'start', 'quote', 'proposal', 'agreement', 'contract', 'project', 'job', 'order'],
    suggested: true,
  });
  add({
    id: 'action:new-invoice',
    title: 'New invoice',
    hint: 'A blank invoice with the next number',
    keywords: ['new', 'create', 'bill', 'charge', 'payment'],
    suggested: true,
  });
  add({
    id: 'action:new-folder',
    title: 'New project folder',
    hint: 'A folder on the desktop to file things into',
    keywords: ['new', 'create', 'folder', 'organise', 'organize', 'group'],
  });
  add({
    id: 'action:add-images',
    title: 'Add images',
    hint: 'Bring pictures in from this device',
    keywords: ['upload', 'import', 'photos', 'pictures', 'images', 'camera', 'add'],
  });
  add({
    id: 'action:guest-book',
    title: 'Open the guest book',
    hint: 'Visitors leave their name and how to reach them',
    keywords: ['guest book', 'guestbook', 'sign in', 'sign up', 'email list', 'mailing list', 'newsletter', 'visitors', 'leads', 'contacts', 'collectors'],
    suggested: true,
  });
  add({
    id: 'action:qr',
    title: 'QR and contact card',
    hint: 'A code a visitor scans to take your details away',
    keywords: ['qr', 'qr code', 'code', 'scan', 'contact card', 'business card', 'website', 'vcard'],
    suggested: true,
  });
  add({
    id: 'action:send-picture',
    title: 'Send a picture',
    hint: "Hand a picture to this device's own mail or messages app",
    keywords: ['send', 'share', 'email', 'text', 'message', 'picture', 'photo'],
  });
  add({
    id: 'action:tidy',
    title: 'Tidy up the desktop',
    hint: 'Line the icons up in a grid',
    keywords: ['tidy', 'arrange icons', 'clean up', 'sort', 'organise', 'organize'],
  });
  add({
    id: 'action:wallpaper',
    title: 'Change the desktop picture',
    hint: 'In Settings: a colour, a photograph or a slideshow',
    keywords: ['wallpaper', 'background', 'slideshow', 'desktop picture', 'photograph'],
  });
  add(
    {
      id: 'action:shortcuts',
      title: 'Keyboard shortcuts',
      hint: 'Every key the app answers to',
      keywords: ['keyboard', 'shortcuts', 'keys', 'hotkeys', 'help', 'cheat sheet'],
      keys: ['?'],
    },
    // A sheet of keys on a phone with no keyboard would be a dead control.
    !context.compact,
  );
  if (context.undoLabel) {
    add({
      id: 'action:undo',
      title: `Undo: ${context.undoLabel.toLowerCase()}`,
      hint: 'Put back the last thing done',
      keywords: ['undo', 'revert', 'back', 'oops'],
      keys: [mod, 'Z'],
    });
  }
  add({
    id: 'action:theme',
    title: context.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    hint: 'The same desktop on a light or a dark ground',
    keywords: ['theme', 'dark', 'light', 'night', 'appearance', 'mode'],
  });
  add(
    {
      id: 'action:fullscreen',
      title: context.fullscreen === 'on' ? 'Leave fullscreen' : 'Go fullscreen',
      hint: 'The browser gets out of the way, for a booth or a presentation',
      keywords: ['fullscreen', 'full screen', 'kiosk', 'present', 'presentation', 'booth'],
    },
    context.fullscreen !== 'unsupported',
  );

  // Windows. None of these mean anything on a phone, where every window is a
  // sheet of its own.
  const two = tiling && context.frames >= 2;
  const tileWords = ['tile', 'tiling', 'arrange', 'windows', 'layout', 'split'];
  add(
    {
      id: 'action:tile-columns',
      title: 'Tile windows side by side',
      hint: 'Every open window in a column of its own',
      keywords: [...tileWords, 'side by side', 'columns', 'split screen'],
      suggested: true,
    },
    two,
  );
  add(
    {
      id: 'action:tile-grid',
      title: 'Tile windows in a grid',
      hint: 'Rows and columns, as square as the screen allows',
      keywords: [...tileWords, 'grid', 'quarters'],
    },
    two,
  );
  add(
    {
      id: 'action:tile-main',
      title: 'Tile around the front window',
      hint: 'The window in front takes most of the screen, the rest stack beside it',
      keywords: [...tileWords, 'main', 'focus', 'master', 'stack'],
    },
    two,
  );
  add(
    {
      id: 'action:tile-rows',
      title: 'Stack windows top to bottom',
      hint: 'Every open window in a row of its own',
      keywords: [...tileWords, 'rows', 'stack', 'top to bottom'],
    },
    two,
  );
  add(
    {
      id: 'action:cascade',
      title: 'Cascade windows',
      hint: 'Each at its own size, stepped so every titlebar shows',
      keywords: ['cascade', 'stack', 'overlap', 'windows', 'arrange'],
    },
    two,
  );
  add(
    {
      id: 'action:untile',
      title: 'Put windows back',
      hint: 'Every snapped or tiled window returns to the size it was given',
      keywords: ['untile', 'restore', 'put back', 'windows', 'free', 'float'],
    },
    tiling && context.snapped,
  );
  add(
    {
      id: 'action:merge',
      title: 'Merge windows into tabs',
      hint: 'One frame, with a tab for each window',
      keywords: ['tabs', 'merge', 'combine', 'windows', 'group'],
    },
    two,
  );
  add(
    {
      id: 'action:snap-left',
      title: 'Snap window to the left half',
      hint: 'The window in front takes the left half of the screen',
      keywords: [...tileWords, 'snap', 'left', 'half'],
      keys: [alt, shift, '←'],
    },
    tiling && context.hasFocused,
  );
  add(
    {
      id: 'action:snap-right',
      title: 'Snap window to the right half',
      hint: 'The window in front takes the right half of the screen',
      keywords: [...tileWords, 'snap', 'right', 'half'],
      keys: [alt, shift, '→'],
    },
    tiling && context.hasFocused,
  );
  add(
    {
      id: 'action:snap-fill',
      title: 'Fill the screen',
      hint: 'The window in front, as big as the desktop',
      keywords: ['maximise', 'maximize', 'zoom', 'fill', 'full', 'big', 'snap'],
      keys: [alt, shift, '↑'],
    },
    tiling && context.hasFocused,
  );
  add(
    {
      id: 'action:auto-tile',
      title: context.autoTile ? 'Turn auto-tiling off' : 'Turn auto-tiling on',
      hint: context.autoTile
        ? 'Windows stay where they are put'
        : 'Windows arrange themselves whenever one opens or closes',
      keywords: [...tileWords, 'auto', 'automatic', 'tiling window manager'],
    },
    tiling,
  );
  return out;
}

/** The studio's records, as the shell holds them. */
export interface LauncherRecords {
  documents: StoredDocument[];
  invoices: Invoice[];
  projects: Project[];
  photos: Photo[];
  shows: Show[];
  guests: GuestEntry[];
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

function dayText(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, SHORT_DATE);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every record as an entry. What something is missing is said, never guessed. */
export function recordEntries(records: LauncherRecords): LauncherEntry[] {
  const out: LauncherEntry[] = [];

  for (const row of records.documents) {
    const doc = row.document;
    const client = doc.client.name.trim();
    out.push({
      id: `commission:${row.id}`,
      section: 'record',
      title: doc.title.trim() || 'Untitled document',
      hint: [doc.documentNumber, client || 'No client named', doc.state === 'archived' ? 'archived' : null]
        .filter(Boolean)
        .join(' · '),
      label: 'Commission',
      keywords: [client, doc.documentNumber, doc.client.email ?? '', 'commission'].filter(Boolean),
    });
  }

  for (const invoice of records.invoices) {
    const client = invoice.client.name.trim();
    out.push({
      id: `invoice:${invoice.id}`,
      section: 'record',
      title: `Invoice ${invoice.invoiceNumber}`,
      hint: [client || 'No client named', invoice.state === 'draft' ? 'draft' : null].filter(Boolean).join(' · '),
      label: 'Invoice',
      keywords: [client, invoice.invoiceNumber, invoice.sourceDocumentNumber ?? '', 'invoice'].filter(Boolean),
    });
  }

  for (const project of records.projects) {
    out.push({
      id: `folder:${project.id}`,
      section: 'record',
      title: project.name.trim() || 'Untitled folder',
      hint: `Project folder · ${plural(projectItemCount(project), 'item')}`,
      label: 'Folder',
      keywords: ['folder', 'project'],
    });
  }

  for (const photo of records.photos) {
    out.push({
      id: `photo:${photo.id}`,
      section: 'record',
      title: photo.title.trim() || 'Untitled picture',
      hint: describePhoto(photo),
      label: 'Artwork',
      keywords: [photo.medium ?? '', photo.year ? String(photo.year) : '', 'artwork', 'picture'].filter(Boolean),
    });
  }

  for (const show of records.shows) {
    out.push({
      id: `show:${show.id}`,
      section: 'record',
      title: show.name.trim() || 'Untitled show',
      hint: [show.venue?.trim() || 'No venue set', dayText(show.startDate) ?? 'No date set'].join(' · '),
      label: 'Show',
      keywords: [show.venue ?? '', 'show'].filter(Boolean),
    });
  }

  for (const guest of records.guests) {
    out.push({
      id: `guest:${guest.id}`,
      section: 'record',
      title: guest.name.trim() || 'Name not given',
      hint: [guest.email, guest.phone, guest.show].filter(Boolean).join(' · ') || 'No contact details',
      label: 'Guest book',
      keywords: [guest.email ?? '', guest.phone ?? '', guest.show ?? '', 'guest'].filter(Boolean),
    });
  }

  return out;
}

/** Lower case, accents off, one space between words — so "Café" is found by "cafe". */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface Prepared {
  entry: LauncherEntry;
  title: string;
  titleWords: string[];
  keywords: string[];
  keywordWords: string[];
  hintWords: string[];
}

function prepare(entry: LauncherEntry): Prepared {
  const title = normalise(entry.title);
  const keywords = (entry.keywords ?? []).map(normalise).filter(Boolean);
  return {
    entry,
    title,
    titleWords: title.split(/[\s·:,./-]+/).filter(Boolean),
    keywords,
    keywordWords: keywords.flatMap((k) => k.split(/[\s·:,./-]+/)).filter(Boolean),
    hintWords: normalise(entry.hint).split(/[\s·:,./-]+/).filter(Boolean),
  };
}

/** Letters of `needle` appear in `hay` in order: "invcs" in "invoices". */
function isSubsequence(needle: string, hay: string): boolean {
  let at = 0;
  for (const ch of hay) {
    if (ch === needle[at]) at += 1;
    if (at === needle.length) return true;
  }
  return false;
}

/** How well one typed word matches. Zero is no match at all. */
function termScore(term: string, p: Prepared): number {
  if (p.title === term) return 120;
  if (p.title.startsWith(term)) return 100;
  if (p.titleWords.some((w) => w.startsWith(term))) return 80;
  if (p.keywords.includes(term)) return 75;
  if (p.keywordWords.some((w) => w.startsWith(term))) return 60;
  if (p.title.includes(term)) return 45;
  if (p.keywords.some((k) => k.includes(term))) return 35;
  if (p.hintWords.some((w) => w.startsWith(term))) return 25;
  if (term.length >= 3 && isSubsequence(term, p.title)) return 12;
  return 0;
}

const SECTION_BONUS: Record<LauncherSection, number> = { tool: 40, action: 30, record: 0 };
const SECTION_ORDER: Record<LauncherSection, number> = { tool: 0, action: 1, record: 2 };

/**
 * The entries that match, best first. Every word has to match somewhere.
 * A whole phrase at the start of a title or a keyword ranks above the same
 * words found apart: "email list" is the guest book before it is anything
 * that merely mentions email.
 */
export function searchLauncher(entries: LauncherEntry[], query: string, limit = 12): LauncherEntry[] {
  const q = normalise(query);
  if (!q) return [];
  const terms = q.split(' ');

  const scored: { entry: LauncherEntry; score: number }[] = [];
  for (const entry of entries) {
    const p = prepare(entry);
    let total = 0;
    let matched = true;
    for (const term of terms) {
      const s = termScore(term, p);
      if (s === 0) {
        matched = false;
        break;
      }
      total += s;
    }
    if (!matched) continue;
    let score = total / terms.length;
    if (terms.length > 1 && (p.title.startsWith(q) || p.keywords.some((k) => k.startsWith(q)))) score += 20;
    // A real match earns the section's place; a loose one does not jump the queue.
    if (score >= 25) score += SECTION_BONUS[entry.section];
    scored.push({ entry, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      SECTION_ORDER[a.entry.section] - SECTION_ORDER[b.entry.section] ||
      a.entry.title.length - b.entry.title.length ||
      a.entry.title.localeCompare(b.entry.title),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

/** What the empty box offers: the tools, then the things done most. */
export function suggestions(entries: LauncherEntry[]): LauncherEntry[] {
  return [
    ...entries.filter((e) => e.section === 'tool' && e.suggested),
    ...entries.filter((e) => e.section === 'action' && e.suggested),
  ];
}

/**
 * Things to try, shown under the empty box so the synonyms are discoverable.
 * Each one finds something on any screen: an example that comes back empty
 * would teach the opposite lesson.
 */
export const TRY_THESE = ['qr', 'mileage', 'booth fee', 'email list', 'receipts'];

// --- G, then a letter ---------------------------------------------------

/** How long after G the second key still counts. */
export const GO_WINDOW_MS = 1500;

export interface GoState {
  /** When G was pressed, or null when not waiting for a second key. */
  armedAt: number | null;
}

/**
 * One key press through the G-sequence. The caller passes only plain keys —
 * none with Ctrl, ⌘ or Alt held — and only when nobody is typing in a field.
 * `consumed` says the key was part of a sequence and should do nothing else.
 */
export function goStep(
  state: GoState,
  key: string,
  now: number,
): { state: GoState; tool: string | null; consumed: boolean } {
  const k = key.toLowerCase();
  const armed = state.armedAt !== null && now - state.armedAt <= GO_WINDOW_MS;
  if (armed) {
    const tool = GO_KEYS[k] ?? null;
    if (tool) return { state: { armedAt: null }, tool, consumed: true };
    if (k === 'g') return { state: { armedAt: now }, tool: null, consumed: true };
    return { state: { armedAt: null }, tool: null, consumed: false };
  }
  if (k === 'g') return { state: { armedAt: now }, tool: null, consumed: true };
  return { state: { armedAt: null }, tool: null, consumed: false };
}
