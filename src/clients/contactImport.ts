/**
 * Reading contacts in from a phone's vCard export or a spreadsheet's CSV.
 * Nothing is merged here: each contact becomes a record of its own and the
 * Clients tool joins it to a person only by email or phone, like any other.
 * A row with no name, email or phone is skipped and counted, never silently.
 * DOM-free.
 */
import { newId } from '../commission/document';
import type { ImportedContact } from './clients';

export interface ContactImportResult {
  contacts: ImportedContact[];
  /** Rows or cards with nothing to go on. */
  skipped: number;
}

function unfold(text: string): string[] {
  // vCard folds long lines: a line starting with a space continues the last.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeVcard(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

export function parseVcards(text: string, now = new Date()): ContactImportResult {
  const contacts: ImportedContact[] = [];
  let skipped = 0;
  let card: { fn: string; n: string; email: string | null; phone: string | null; note: string | null } | null = null;
  for (const raw of unfold(text)) {
    const line = raw.trim();
    if (/^BEGIN:VCARD$/i.test(line)) {
      card = { fn: '', n: '', email: null, phone: null, note: null };
      continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      if (card) {
        const fromN = card.n.split(';').slice(0, 2).reverse().filter(Boolean).join(' ');
        const made = make(card.fn || fromN, card.email, card.phone, card.note, now);
        if (made) contacts.push(made);
        else skipped += 1;
      }
      card = null;
      continue;
    }
    if (!card) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0]!.split('.').pop()!.toUpperCase();
    const value = unescapeVcard(line.slice(colon + 1));
    if (name === 'FN') card.fn = value;
    else if (name === 'N') card.n = value;
    else if (name === 'EMAIL' && !card.email) card.email = value || null;
    else if (name === 'TEL' && !card.phone) card.phone = value.replace(/^tel:/i, '') || null;
    else if (name === 'NOTE') card.note = value || null;
  }
  return { contacts, skipped };
}

/** One CSV line into cells, honouring quotes. */
export function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * A CSV with a header row. Columns are found by name — "Name" or "First
 * name"/"Last name", anything with "mail", anything with "phone" or "mobile",
 * "Note(s)". Returns null when no column could be recognised at all.
 */
export function parseContactsCsv(text: string, now = new Date()): ContactImportResult | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length === 0) return null;
  const header = csvCells(lines[0]!).map((h) => h.toLowerCase());
  const find = (test: (h: string) => boolean) => header.findIndex(test);
  const nameAt = find((h) => h === 'name' || h === 'full name' || h === 'display name');
  const firstAt = find((h) => h.startsWith('first') || h === 'given name');
  const lastAt = find((h) => h.startsWith('last') || h === 'family name' || h === 'surname');
  const emailAt = find((h) => h.includes('mail'));
  const phoneAt = find((h) => h.includes('phone') || h.includes('mobile') || h === 'tel');
  const noteAt = find((h) => h.startsWith('note'));
  if ([nameAt, firstAt, lastAt, emailAt, phoneAt].every((i) => i < 0)) return null;

  const contacts: ImportedContact[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = csvCells(line);
    const at = (i: number) => (i >= 0 ? cells[i] ?? '' : '');
    const name = at(nameAt) || [at(firstAt), at(lastAt)].filter(Boolean).join(' ');
    const made = make(name, at(emailAt) || null, at(phoneAt) || null, at(noteAt) || null, now);
    if (made) contacts.push(made);
    else skipped += 1;
  }
  return { contacts, skipped };
}

function make(name: string, email: string | null, phone: string | null, note: string | null, now: Date): ImportedContact | null {
  const clean = name.trim();
  if (!clean && !email && !phone) return null;
  return {
    id: newId(),
    name: clean,
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    note: note?.trim() || null,
    importedAt: now.toISOString(),
  };
}

/** Reads a file's text as whichever format it is. */
export function parseContacts(text: string, now = new Date()): ContactImportResult | null {
  return /BEGIN:VCARD/i.test(text) ? parseVcards(text, now) : parseContactsCsv(text, now);
}

/** Contacts already present (same email or phone, or same name with neither) are left out. */
export function newContacts(incoming: ImportedContact[], existing: ImportedContact[]): ImportedContact[] {
  const seen = new Set(existing.map(signature));
  const out: ImportedContact[] = [];
  for (const contact of incoming) {
    const sig = signature(contact);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(contact);
  }
  return out;
}

function signature(c: ImportedContact): string {
  return `${(c.email ?? '').toLowerCase()}|${(c.phone ?? '').replace(/\D/g, '')}|${c.name.toLowerCase()}`;
}
