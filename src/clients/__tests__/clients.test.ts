import { describe, expect, it } from 'vitest';
import { applyEdit, createDocument } from '../../commission/document';
import { createBlankInvoice } from '../../invoice/invoice';
import { emptyPaymentInstructions } from '../../lib/prefs';
import { emptyDraft, signGuestBook } from '../../connect/guestbook';
import type { StoredDocument } from '../../persistence/repository';
import type { CommissionDocument } from '../../commission/types';
import {
  buildPeople,
  followUpsDue,
  markDifferent,
  mergePeople,
  newProfile,
  possibleSamePeople,
  searchPeople,
} from '../clients';

const row = (document: CommissionDocument): StoredDocument =>
  ({ id: document.id, workspaceId: 'w', revision: 1, document, saveState: 'local', conflict: null }) as unknown as StoredDocument;

function commission(name: string, email: string | null, phone: string | null = null) {
  const doc = createDocument('AO-2026-0001', new Date('2026-05-01T10:00:00Z'));
  return row({ ...doc, client: { ...doc.client, name, email, phone } });
}

const guest = (name: string, email: string, phone = '') =>
  signGuestBook({ ...emptyDraft('Harvest Fair'), name, email, phone }, new Date('2026-03-01T10:00:00Z'));

describe('buildPeople', () => {
  it('a guest who later commissions a piece is one person, with both', () => {
    const people = buildPeople({
      documents: [commission('Ana Ruiz', 'ANA@example.com ')],
      invoices: [],
      guests: [guest('Ana', 'ana@example.com')],
      profiles: [],
    });
    expect(people).toHaveLength(1);
    expect(people[0]!.sources.map((s) => s.kind).sort()).toEqual(['commission', 'guest']);
    expect(people[0]!.name).toBe('Ana Ruiz'); // the newest record names them
    expect(people[0]!.lastContact).toBe('2026-05-01');
  });

  it('joins by phone number however it was typed', () => {
    const people = buildPeople({
      documents: [commission('Bo', null, '+1 (555) 010-2000')],
      invoices: [],
      guests: [guest('Bo', '', '555 010 2000')],
      profiles: [],
    });
    expect(people).toHaveLength(1);
  });

  it('never joins on a shared name alone — it offers instead', () => {
    const people = buildPeople({
      documents: [commission('Sam Lee', 'sam@a.com')],
      invoices: [],
      guests: [guest('Sam Lee', 'sam@b.com')],
      profiles: [],
    });
    expect(people).toHaveLength(2);
    expect(possibleSamePeople(people)).toHaveLength(1);
  });

  it('a merge the artist accepts holds, and loses no tags or notes', () => {
    const base = { documents: [commission('Sam Lee', 'sam@a.com')], invoices: [], guests: [guest('Sam Lee', 'sam@b.com')] };
    let people = buildPeople({ ...base, profiles: [] });
    const [a, b] = possibleSamePeople(people)[0]!;
    const withTag = { ...b, profile: { ...newProfile(b.keys), tags: ['collector'], note: 'Likes blue' } };
    const { keep } = mergePeople(a, withTag);
    people = buildPeople({ ...base, profiles: [keep] });
    expect(people).toHaveLength(1);
    expect(people[0]!.profile?.tags).toEqual(['collector']);
    expect(people[0]!.profile?.note).toBe('Likes blue');
    expect(possibleSamePeople(people)).toHaveLength(0);
  });

  it('"not the same person" stops the offer', () => {
    const base = { documents: [commission('Sam Lee', 'sam@a.com')], invoices: [], guests: [guest('Sam Lee', 'sam@b.com')] };
    const people = buildPeople({ ...base, profiles: [] });
    const [a, b] = possibleSamePeople(people)[0]!;
    const again = buildPeople({ ...base, profiles: [markDifferent(a, b)] });
    expect(possibleSamePeople(again)).toHaveLength(0);
  });

  it('spend counts payments once and says what it could not see', () => {
    const doc = commission('Cy', 'cy@x.com');
    const paid = { ...doc, document: { ...doc.document, payments: [{ id: 'p', date: '2026-05-02', amount: 50000, note: null }] } };
    const invoice = {
      ...createBlankInvoice('INV-1', emptyPaymentInstructions()),
      client: { ...doc.document.client },
      payments: [{ id: 'q', date: '2026-06-01', amount: 20000, note: null }],
    };
    const [person] = buildPeople({ documents: [paid], invoices: [invoice], guests: [], profiles: [] });
    expect(person!.spend).toEqual({ [doc.document.quote.currency]: 70000 });
    // Neither has a price set.
    expect(person!.notCounted).toBe(2);
  });

  it('skips a commission with no client at all', () => {
    const doc = createDocument('AO-1');
    expect(buildPeople({ documents: [row(applyEdit(doc, { title: 'x' }))], invoices: [], guests: [], profiles: [] })).toEqual([]);
  });
});

describe('follow-ups and search', () => {
  it('lists overdue and upcoming follow-ups, not later ones', () => {
    const people = buildPeople({ documents: [commission('A', 'a@x.com'), commission('B', 'b@x.com'), commission('C', 'c@x.com')], invoices: [], guests: [], profiles: [] });
    const profiles = people.map((p, i) => ({ ...newProfile(p.keys), label: p.name, followUp: ['2026-09-01', '2026-10-05', '2027-01-01'][i]! }));
    const due = followUpsDue(profiles, '2026-09-26', '2026-10-26');
    expect(due.map((d) => [d.title, d.overdue])).toEqual([
      ['A', true],
      ['B', false],
    ]);
  });

  it('finds by tag', () => {
    const [p] = buildPeople({ documents: [commission('A', 'a@x.com')], invoices: [], guests: [], profiles: [] });
    const tagged = { ...p!, profile: { ...newProfile(p!.keys), tags: ['gallery'] } };
    expect(searchPeople([tagged], 'galler')).toHaveLength(1);
    expect(searchPeople([tagged], 'nope')).toHaveLength(0);
  });
});
