/**
 * The mailing list, DOM-free.
 *
 * Built, never stored: from guest-book entries whose signer said yes, and
 * from clients the artist marked "may email". Consent is never assumed — a
 * client nobody asked is not on it, and a guest who said no is not on it.
 * When one address signed more than once, the latest answer stands, so a
 * later "no" takes someone off.
 *
 * Nothing here sends. The list leaves as a CSV for a newsletter tool, or as
 * a mail draft the artist's own app opens (BCC, so nobody sees the others).
 */
import type { ClientProfile } from '../clients/clients';
import { normaliseEmail } from '../clients/clients';
import type { GuestEntry } from './guestbook';

export interface Subscriber {
  email: string;
  name: string;
  /** Show names they signed in at, as typed. */
  shows: string[];
  likedPhotoIds: string[];
  /** Tags from their client profile. */
  tags: string[];
  from: ('guest book' | 'client')[];
}

export interface Segment {
  show: string | null;
  likedPhotoId: string | null;
  tag: string | null;
}

export const EVERYONE: Segment = { show: null, likedPhotoId: null, tag: null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function buildList(guests: GuestEntry[], profiles: ClientProfile[]): Subscriber[] {
  const byEmail = new Map<string, Subscriber>();
  const add = (email: string, name: string, from: Subscriber['from'][number]) => {
    const existing = byEmail.get(email);
    if (existing) {
      if (!existing.from.includes(from)) existing.from.push(from);
      return existing;
    }
    const sub: Subscriber = { email, name, shows: [], likedPhotoIds: [], tags: [], from: [from] };
    byEmail.set(email, sub);
    return sub;
  };

  // The latest answer per address decides; older entries still add shows
  // and likes once someone is on the list.
  const latest = new Map<string, GuestEntry>();
  for (const guest of guests) {
    const email = normaliseEmail(guest.email);
    if (!email) continue;
    const seen = latest.get(email);
    if (!seen || guest.signedAt > seen.signedAt) latest.set(email, guest);
  }
  for (const [email, guest] of latest) {
    if (!guest.consented) continue;
    add(email, guest.name, 'guest book');
  }
  for (const guest of guests) {
    const email = normaliseEmail(guest.email);
    const sub = email ? byEmail.get(email) : undefined;
    if (!sub) continue;
    if (guest.show && !sub.shows.some((s) => same(s, guest.show!))) sub.shows.push(guest.show.trim());
    for (const id of guest.likedPhotoIds ?? []) if (!sub.likedPhotoIds.includes(id)) sub.likedPhotoIds.push(id);
  }

  for (const profile of profiles) {
    const emails = profile.keys.filter((k) => k.startsWith('email:')).map((k) => k.slice(6));
    if (profile.mayEmail === false) {
      // A client who said no comes off, even if a guest entry said yes before.
      for (const email of emails) byEmail.delete(email);
      continue;
    }
    for (const email of emails) {
      const sub = profile.mayEmail === true ? add(email, profile.name ?? profile.label ?? email, 'client') : byEmail.get(email);
      if (!sub) continue;
      for (const tag of profile.tags) if (!sub.tags.some((t) => same(t, tag))) sub.tags.push(tag);
    }
  }

  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function inSegment(sub: Subscriber, segment: Segment): boolean {
  if (segment.show && !sub.shows.some((s) => same(s, segment.show!))) return false;
  if (segment.likedPhotoId && !sub.likedPhotoIds.includes(segment.likedPhotoId)) return false;
  if (segment.tag && !sub.tags.some((t) => same(t, segment.tag!))) return false;
  return true;
}

export function segmentOf(list: Subscriber[], segment: Segment): Subscriber[] {
  return list.filter((sub) => inSegment(sub, segment));
}

/** What a segment is called, for a file name or a heading. */
export function describeSegment(segment: Segment, titleOf: (photoId: string) => string): string {
  const parts = [
    segment.show ? `signed in at ${segment.show}` : null,
    segment.likedPhotoId ? `liked ${titleOf(segment.likedPhotoId)}` : null,
    segment.tag ? `tagged ${segment.tag}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'everyone';
}

/** Every distinct tag and show on the list, for the pickers. */
export function choices(list: Subscriber[]): { shows: string[]; tags: string[]; likedPhotoIds: string[] } {
  const uniq = (values: string[]) => {
    const out: string[] = [];
    for (const v of values) if (!out.some((o) => same(o, v))) out.push(v);
    return out.sort((a, b) => a.localeCompare(b));
  };
  return {
    shows: uniq(list.flatMap((s) => s.shows)),
    tags: uniq(list.flatMap((s) => s.tags)),
    likedPhotoIds: [...new Set(list.flatMap((s) => s.likedPhotoIds))],
  };
}

function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * The CSV a newsletter tool reads. `email`, `first_name` and `last_name` are
 * the names Kit and Buttondown expect and Mailchimp maps on import; `tags`
 * carries the shows and client tags, so the segment survives the move.
 */
export function listCsv(list: Subscriber[]): string {
  const rows = list.map((sub) => {
    const [first, ...rest] = sub.name.trim().split(/\s+/);
    return [sub.email, first ?? '', rest.join(' '), [...sub.shows, ...sub.tags].join(', ')];
  });
  return [['email', 'first_name', 'last_name', 'tags'], ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** A file name for a segment: "mailing-list-spring-market.csv". */
export function csvName(segment: Segment, titleOf: (photoId: string) => string): string {
  const what = describeSegment(segment, titleOf);
  const slug = what === 'everyone' ? '' : `-${slugify(what)}`;
  return `mailing-list${slug}.csv`;
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60);
}

/**
 * Up to this many, an announcement can go as one draft in the artist's own
 * mail app. Past it, mail apps and providers balk, and a newsletter tool is
 * the honest way — the composer says so and offers the CSV instead.
 */
export const MAILTO_LIMIT = 30;

export function announcementMailto(list: Subscriber[], subject: string, body: string): string | null {
  if (list.length === 0 || list.length > MAILTO_LIMIT) return null;
  const bcc = list.map((s) => s.email).join(',');
  return `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * The studio's site with the show's name on it, for a QR at that show. Any
 * analytics the site already has (it is the artist's own) then shows which
 * fair a visit came from. Null when the site address is not a web address.
 */
export function showLink(siteUrl: string, showName: string | null): string | null {
  const t = siteUrl.trim();
  if (!t) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:/i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (showName?.trim()) {
    url.searchParams.set('utm_source', 'qr');
    url.searchParams.set('utm_medium', 'show');
    url.searchParams.set('utm_campaign', slugify(showName));
  }
  return url.href;
}
