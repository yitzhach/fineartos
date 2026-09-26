/**
 * Clients: one person, built from what the studio already holds — the client
 * on a commission, the client on an invoice, a guest who signed the book.
 *
 * Two records are the same person on their own only when they share an email
 * address or a phone number: that is identity, not a guess. Two that merely
 * share a name are offered for merging and never merged silently — there are
 * a great many people called Sam. A merge the artist accepts is kept on the
 * client profile, so it survives every rebuild.
 *
 * Nothing here is stored except the profile (tags, follow-up, note, merges);
 * everything else is worked out from the records each time, so it cannot
 * drift from what is true. DOM-free, like the rest of the model layer.
 */
import type { StoredDocument } from '../persistence/repository';
import type { Invoice } from '../invoice/types';
import type { GuestEntry } from '../connect/guestbook';
import { newId } from '../commission/document';

/** What the artist keeps on a person. Only this is stored. */
export interface ClientProfile {
  id: string;
  /** Identity keys (see `keysOf`) this profile speaks for — merges live here. */
  keys: string[];
  /** A name the artist chose; null means use the one on the records. */
  name: string | null;
  /**
   * The name as it read at the last save — so Coming up and the search box
   * can name a person without rebuilding everyone from the records.
   */
  label?: string;
  tags: string[];
  /** yyyy-mm-dd, shown in Coming up. Null: no follow-up planned. */
  followUp: string | null;
  note: string | null;
  /** Keys the artist said are NOT this person, so they are not offered again. */
  notSame: string[];
  createdAt: string;
  updatedAt: string;
}

/** A contact read in from a vCard or a CSV, before it is anybody. */
export interface ImportedContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  importedAt: string;
}

export type SourceKind = 'commission' | 'invoice' | 'guest' | 'contact';

export interface ClientSource {
  kind: SourceKind;
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** yyyy-mm-dd of the last dealing this record shows. */
  date: string | null;
  /** A human label: "AO-2026-0001 · Lobby triptych". */
  label: string;
}

export interface Person {
  /**
   * The first identity key. It can change when records are merged or an
   * email is added, so anything pointing at a person resolves through
   * `personFor`, which also knows every key and the profile id.
   */
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  keys: string[];
  sources: ClientSource[];
  profile: ClientProfile | null;
  lastContact: string | null;
  /** Money received, per currency, in minor units. */
  spend: Record<string, number>;
  /** Commissions and invoices with no price set: the spend cannot see them. */
  notCounted: number;
}

export const normaliseEmail = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
};

/** Digits only, the last ten — "+1 (555) 010-2000" and "555 010 2000" agree. */
export const normalisePhone = (value: string | null | undefined): string | null => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
};

export const normaliseName = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

/** The identity keys a record carries. Name alone is not one. */
export function keysOf(source: { email: string | null; phone: string | null }): string[] {
  const keys: string[] = [];
  const email = normaliseEmail(source.email);
  const phone = normalisePhone(source.phone);
  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  return keys;
}

/** A record with no email and no phone is known by its name only, per record. */
function soleKey(source: ClientSource): string {
  return `only:${source.kind}:${source.id}`;
}

export function sourcesFrom(input: {
  documents: StoredDocument[];
  invoices: Invoice[];
  guests: GuestEntry[];
  contacts?: ImportedContact[];
}): ClientSource[] {
  const out: ClientSource[] = [];
  for (const row of input.documents) {
    const doc = row.document;
    if (!doc.client.name.trim() && !doc.client.email && !doc.client.phone) continue;
    out.push({
      kind: 'commission',
      id: doc.id,
      name: doc.client.name.trim(),
      email: doc.client.email,
      phone: doc.client.phone,
      date: (doc.updatedAt ?? doc.createdAt ?? '').slice(0, 10) || null,
      label: [doc.documentNumber, doc.title].filter(Boolean).join(' · '),
    });
  }
  for (const invoice of input.invoices) {
    if (!invoice.client.name.trim() && !invoice.client.email && !invoice.client.phone) continue;
    out.push({
      kind: 'invoice',
      id: invoice.id,
      name: invoice.client.name.trim(),
      email: invoice.client.email,
      phone: invoice.client.phone,
      date: latest([invoice.issueDate, ...invoice.payments.map((p) => p.date)]),
      label: `Invoice ${invoice.invoiceNumber}`,
    });
  }
  for (const guest of input.guests) {
    out.push({
      kind: 'guest',
      id: guest.id,
      name: guest.name.trim(),
      email: guest.email,
      phone: guest.phone,
      date: guest.signedAt.slice(0, 10),
      label: guest.show ? `Signed the guest book at ${guest.show}` : 'Signed the guest book',
    });
  }
  for (const contact of input.contacts ?? []) {
    out.push({
      kind: 'contact',
      id: contact.id,
      name: contact.name.trim(),
      email: contact.email,
      phone: contact.phone,
      date: null,
      label: 'Imported contact',
    });
  }
  return out;
}

/** A quote with nothing priced on it: unknown, not free (rule 1). */
function priced(quote: { lineItems: { quantity: number; unitPrice: number }[] }): boolean {
  return quote.lineItems.some((line) => line.quantity * line.unitPrice > 0);
}

function latest(dates: (string | null | undefined)[]): string | null {
  const real = dates.filter((d): d is string => Boolean(d)).map((d) => d.slice(0, 10));
  return real.length ? real.sort().at(-1)! : null;
}

/** Union-find over keys: anything sharing a key, or joined by a profile, is one. */
class Groups {
  private parent = new Map<string, string>();
  find(key: string): string {
    let root = this.parent.get(key) ?? key;
    if (root !== key) root = this.find(root);
    this.parent.set(key, root);
    return root;
  }
  join(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

export function buildPeople(input: {
  documents: StoredDocument[];
  invoices: Invoice[];
  guests: GuestEntry[];
  contacts?: ImportedContact[];
  profiles: ClientProfile[];
}): Person[] {
  const sources = sourcesFrom(input);
  const groups = new Groups();
  const keysBySource = new Map<ClientSource, string[]>();
  for (const source of sources) {
    const keys = keysOf(source);
    const all = keys.length ? keys : [soleKey(source)];
    keysBySource.set(source, all);
    for (const key of all.slice(1)) groups.join(all[0]!, key);
  }
  for (const profile of input.profiles) {
    for (const key of profile.keys.slice(1)) groups.join(profile.keys[0]!, key);
  }

  const byRoot = new Map<string, ClientSource[]>();
  for (const source of sources) {
    const root = groups.find(keysBySource.get(source)![0]!);
    byRoot.set(root, [...(byRoot.get(root) ?? []), source]);
  }

  const profileByRoot = new Map<string, ClientProfile>();
  for (const profile of input.profiles) {
    if (profile.keys[0]) profileByRoot.set(groups.find(profile.keys[0]), profile);
  }

  const docs = new Map(input.documents.map((row) => [row.document.id, row.document]));
  const invoices = new Map(input.invoices.map((one) => [one.id, one]));

  const people: Person[] = [];
  for (const [root, group] of byRoot) {
    const profile = profileByRoot.get(root) ?? null;
    const keys = [...new Set(group.flatMap((s) => keysBySource.get(s)!))].sort();
    const emails = [...new Set(group.map((s) => normaliseEmail(s.email)).filter((e): e is string => Boolean(e)))];
    const phones = [...new Set(group.map((s) => s.phone?.trim()).filter((p): p is string => Boolean(p)))];
    const named = group.filter((s) => s.name).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    // Money: invoice payments; a commission's own only when no invoice came from it.
    const spend: Record<string, number> = {};
    let notCounted = 0;
    const invoicedDocs = new Set(
      group.filter((s) => s.kind === 'invoice').map((s) => invoices.get(s.id)?.sourceDocumentId).filter(Boolean),
    );
    for (const source of group) {
      if (source.kind === 'invoice') {
        const invoice = invoices.get(source.id)!;
        if (!priced(invoice.quote)) notCounted += 1;
        for (const p of invoice.payments) spend[invoice.quote.currency] = (spend[invoice.quote.currency] ?? 0) + p.amount;
      } else if (source.kind === 'commission' && !invoicedDocs.has(source.id)) {
        const doc = docs.get(source.id)!;
        if (!priced(doc.quote)) notCounted += 1;
        for (const p of doc.payments) spend[doc.quote.currency] = (spend[doc.quote.currency] ?? 0) + p.amount;
      }
    }

    people.push({
      id: keys[0]!,
      name: profile?.name || named[0]?.name || emails[0] || phones[0] || 'No name given',
      emails,
      phones,
      keys,
      sources: [...group].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
      profile,
      lastContact: latest(group.map((s) => s.date)),
      spend,
      notCounted,
    });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Pairs that might be one person: the same name, different keys, and not
 * already marked as different. Offered, never acted on.
 */
export function possibleSamePeople(people: Person[]): [Person, Person][] {
  const byName = new Map<string, Person[]>();
  for (const person of people) {
    const name = normaliseName(person.name);
    if (!name || name === 'no name given') continue;
    byName.set(name, [...(byName.get(name) ?? []), person]);
  }
  const pairs: [Person, Person][] = [];
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const told = [...(a.profile?.notSame ?? []), ...(b.profile?.notSame ?? [])];
        if (b.keys.some((k) => told.includes(k)) || a.keys.some((k) => told.includes(k))) continue;
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/** The person an id points at: their id, any of their keys, or their profile. */
export function personFor(people: Person[], id: string): Person | null {
  return people.find((p) => p.id === id || p.keys.includes(id) || p.profile?.id === id) ?? null;
}

export function newProfile(keys: string[], now = new Date()): ClientProfile {
  const iso = now.toISOString();
  return { id: newId(), keys: [...keys], name: null, tags: [], followUp: null, note: null, notSame: [], createdAt: iso, updatedAt: iso };
}

/** The profile a person's edits go to: theirs, or a new one over their keys. */
export function profileFor(person: Person, now = new Date()): ClientProfile {
  const profile = person.profile ?? newProfile(person.keys, now);
  return { ...profile, label: person.name };
}

export function editProfile(profile: ClientProfile, changes: Partial<ClientProfile>, now = new Date()): ClientProfile {
  return { ...profile, ...changes, id: profile.id, updatedAt: now.toISOString() };
}

/**
 * The artist said these two are one person. Returns the profile to keep and
 * the id of any profile it replaces (to delete). Tags and notes are combined,
 * the earlier follow-up wins — a merge loses nothing the artist wrote.
 */
export function mergePeople(a: Person, b: Person, now = new Date()): { keep: ClientProfile; drop: string | null } {
  const base = profileFor(a, now);
  const other = b.profile;
  const followUps = [base.followUp, other?.followUp].filter((d): d is string => Boolean(d)).sort();
  const notes = [base.note, other?.note].filter(Boolean);
  const keep = editProfile(
    base,
    {
      keys: [...new Set([...base.keys, ...a.keys, ...b.keys, ...(other?.keys ?? [])])],
      tags: [...new Set([...base.tags, ...(other?.tags ?? [])])],
      followUp: followUps[0] ?? null,
      note: notes.length ? notes.join('\n\n') : null,
      notSame: [...new Set([...base.notSame, ...(other?.notSame ?? [])])],
    },
    now,
  );
  return { keep, drop: other && other.id !== keep.id ? other.id : null };
}

/** The artist said these are two people: stop offering them. */
export function markDifferent(a: Person, b: Person, now = new Date()): ClientProfile {
  const base = profileFor(a, now);
  return editProfile(base, { notSame: [...new Set([...base.notSame, ...b.keys])] }, now);
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];
}

export function searchPeople(people: Person[], query: string): Person[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  return people.filter((p) =>
    [p.name, ...p.emails, ...p.phones, ...(p.profile?.tags ?? []), p.profile?.note ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

/** Follow-ups for Coming up: overdue ones, and those within the horizon. */
export { followUpsDue } from './followUps';
