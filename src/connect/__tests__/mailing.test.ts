import { describe, expect, it } from 'vitest';
import type { GuestEntry } from '../guestbook';
import type { ClientProfile } from '../../clients/clients';
import {
  EVERYONE,
  MAILTO_LIMIT,
  announcementMailto,
  buildList,
  choices,
  csvName,
  describeSegment,
  listCsv,
  segmentOf,
  showLink,
} from '../mailing';

const guest = (over: Partial<GuestEntry>): GuestEntry => ({
  id: Math.random().toString(36),
  name: 'Ana Ruiz',
  email: 'ana@example.com',
  phone: null,
  show: 'Spring Market',
  note: null,
  consented: true,
  likedPhotoIds: [],
  signaturePaths: null,
  signedAt: '2026-10-01T10:00:00Z',
  ...over,
});
const profile = (over: Partial<ClientProfile>): ClientProfile => ({
  id: 'p', keys: [], name: null, tags: [], followUp: null, note: null, notSame: [],
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
});

describe('who is on the list', () => {
  it('only guests who said yes and gave an email', () => {
    const list = buildList([
      guest({}),
      guest({ name: 'No', email: 'no@example.com', consented: false }),
      guest({ name: 'Phone only', email: null }),
    ], []);
    expect(list.map((s) => s.email)).toEqual(['ana@example.com']);
  });

  it('one address once, with every show and like; the latest answer stands', () => {
    const list = buildList([
      guest({ email: 'ANA@example.com ', show: 'Spring Market', likedPhotoIds: ['p1'] }),
      guest({ show: 'Autumn Fair', likedPhotoIds: ['p2'], signedAt: '2026-10-05T10:00:00Z' }),
    ], []);
    expect(list).toHaveLength(1);
    expect(list[0]!.shows).toEqual(['Spring Market', 'Autumn Fair']);
    expect(list[0]!.likedPhotoIds).toEqual(['p1', 'p2']);
    const withdrawn = buildList([guest({}), guest({ consented: false, signedAt: '2026-10-09T00:00:00Z' })], []);
    expect(withdrawn).toEqual([]);
  });

  it('clients only when marked may-email; never by default; a no takes them off', () => {
    const keys = ['email:bo@example.com', 'phone:5550102000'];
    expect(buildList([], [profile({ keys, label: 'Bo' })])).toEqual([]);
    const yes = buildList([], [profile({ keys, label: 'Bo', mayEmail: true, tags: ['collector'] })]);
    expect(yes).toEqual([expect.objectContaining({ email: 'bo@example.com', name: 'Bo', tags: ['collector'], from: ['client'] })]);
    expect(buildList([guest({})], [profile({ keys: ['email:ana@example.com'], mayEmail: false })])).toEqual([]);
  });

  it('a consenting guest picks up their client tags without being asked twice', () => {
    const list = buildList([guest({})], [profile({ keys: ['email:ana@example.com'], tags: ['press'] })]);
    expect(list[0]!.tags).toEqual(['press']);
  });
});

describe('segments and leaving', () => {
  const list = buildList([
    guest({ name: 'Ana Ruiz', likedPhotoIds: ['p1'] }),
    guest({ name: 'Cy Ode', email: 'cy@example.com', show: 'Autumn Fair' }),
  ], [profile({ keys: ['email:cy@example.com'], tags: ['Collector'] })]);
  const titleOf = (id: string) => (id === 'p1' ? 'River' : id);

  it('by show, liked piece and tag, case-blind', () => {
    expect(segmentOf(list, { ...EVERYONE, show: 'spring market' }).map((s) => s.name)).toEqual(['Ana Ruiz']);
    expect(segmentOf(list, { ...EVERYONE, likedPhotoId: 'p1' }).map((s) => s.name)).toEqual(['Ana Ruiz']);
    expect(segmentOf(list, { ...EVERYONE, tag: 'collector' }).map((s) => s.name)).toEqual(['Cy Ode']);
    expect(choices(list)).toEqual({ shows: ['Autumn Fair', 'Spring Market'], tags: ['Collector'], likedPhotoIds: ['p1'] });
  });

  it('a CSV newsletter tools read, named after the segment', () => {
    const csv = listCsv(segmentOf(list, { ...EVERYONE, show: 'Spring Market' }));
    expect(csv).toBe('"email","first_name","last_name","tags"\r\n"ana@example.com","Ana","Ruiz","Spring Market"');
    expect(csvName({ ...EVERYONE, show: 'Spring Market' }, titleOf)).toBe('mailing-list-signed-in-at-spring-market.csv');
    expect(csvName(EVERYONE, titleOf)).toBe('mailing-list.csv');
    expect(describeSegment({ ...EVERYONE, likedPhotoId: 'p1' }, titleOf)).toBe('liked River');
  });

  it('guards a spreadsheet against a formula in a name', () => {
    expect(listCsv(buildList([guest({ name: '=cmd' })], []))).toContain(`"'=cmd"`);
  });

  it('a mail draft BCCs a few people, and refuses past the limit', () => {
    const href = announcementMailto(list, 'New work', 'Hello')!;
    expect(href.startsWith('mailto:?bcc=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('ana@example.com,cy@example.com');
    expect(announcementMailto([], 's', 'b')).toBeNull();
    const many = Array.from({ length: MAILTO_LIMIT + 1 }, (_, i) => ({ ...list[0]!, email: `${i}@x.co` }));
    expect(announcementMailto(many, 's', 'b')).toBeNull();
  });
});

describe('a QR that says which show', () => {
  it("adds the show's name to the studio site, keeping what was there", () => {
    expect(showLink('studio.example/work?x=1', 'Spring Market')).toBe(
      'https://studio.example/work?x=1&utm_source=qr&utm_medium=show&utm_campaign=spring-market',
    );
    expect(showLink('https://studio.example', null)).toBe('https://studio.example/');
    expect(showLink('', 'X')).toBeNull();
    expect(showLink('javascript:alert(1)', 'X')).toBeNull();
  });
});
