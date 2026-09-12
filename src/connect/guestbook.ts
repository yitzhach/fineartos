/**
 * The guest book.
 *
 * What a visitor writes at a booth: a name, and whatever way they are happy
 * to be contacted. Everything except the name is optional, because at a show
 * people are standing up, holding a coffee, and half the entries will be a
 * first name and nothing else. An entry with no name at all is refused — a
 * blank row is not a lead, it is noise in the list.
 *
 * The list is local to this device. Nothing is sent anywhere from here: see
 * `mailtoLink` and `smsLink`, which hand off to the phone's own mail and
 * messages apps rather than pretending this app can send.
 *
 * DOM-free, like the rest of the model layer.
 */

import { newId } from '../commission/document';

export interface GuestEntry {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Where they saw the work — the show's name, typed once and reused. */
  show: string | null;
  note: string | null;
  /** True when the visitor said yes to hearing from the studio. */
  consented: boolean;
  /**
   * Pictures the visitor tapped as ones they liked. Empty means they were not
   * asked or did not pick any — never that they disliked everything.
   */
  likedPhotoIds: string[];
  /**
   * The signature, as SVG path data drawn in a 320×120 box.
   *
   * Paths rather than a PNG on purpose: a scribble is a few hundred bytes as
   * a path and tens of kilobytes as an image, and these live in localStorage
   * alongside everything else. Null means they did not sign — plenty of
   * people will not, and an empty box is not a signature.
   */
  signaturePaths: string[] | null;
  signedAt: string;
}

export interface GuestDraft {
  name: string;
  email: string;
  phone: string;
  show: string;
  note: string;
  consented: boolean;
  likedPhotoIds: string[];
  signaturePaths: string[];
}

export const emptyDraft = (show = ''): GuestDraft => ({
  name: '',
  email: '',
  phone: '',
  show,
  note: '',
  consented: false,
  likedPhotoIds: [],
  signaturePaths: [],
});

/** Why a draft cannot be signed, or null when it can. */
export function draftProblem(draft: GuestDraft): string | null {
  if (!draft.name.trim()) return 'A name is needed — everything else is optional.';
  if (draft.email.trim() && !looksLikeEmail(draft.email)) {
    return 'That email address does not look right. Leave it blank if you would rather not say.';
  }
  return null;
}

export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  // Deliberately loose: this is a check against a typo, not an attempt to
  // decide what a valid address is. Rejecting a real address is the worse
  // mistake at a booth, because the visitor is standing right there.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function signGuestBook(draft: GuestDraft, now = new Date()): GuestEntry {
  return {
    id: newId(),
    name: draft.name.trim(),
    email: trimmedOrNull(draft.email),
    phone: trimmedOrNull(draft.phone),
    show: trimmedOrNull(draft.show),
    note: trimmedOrNull(draft.note),
    consented: draft.consented,
    likedPhotoIds: [...draft.likedPhotoIds],
    signaturePaths: draft.signaturePaths.length > 0 ? [...draft.signaturePaths] : null,
    signedAt: now.toISOString(),
  };
}

/** Newest first: at a show the last person to sign is the one being talked to. */
export function addEntry(entries: GuestEntry[], entry: GuestEntry): GuestEntry[] {
  return [entry, ...entries];
}

export function removeGuest(entries: GuestEntry[], id: string): GuestEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/**
 * Someone who signed twice at the same show — common, and worth flagging
 * rather than silently merging, because two people can share a name.
 */
export function possibleDuplicates(entries: GuestEntry[], entry: GuestEntry): GuestEntry[] {
  const email = entry.email?.toLowerCase();
  const phone = digitsOf(entry.phone);
  return entries.filter((other) => {
    if (other.id === entry.id) return false;
    if (email && other.email?.toLowerCase() === email) return true;
    if (phone && digitsOf(other.phone) === phone) return true;
    return false;
  });
}

/** The box a signature is drawn and displayed in. */
export const SIGNATURE_WIDTH = 320;
export const SIGNATURE_HEIGHT = 120;

/**
 * One stroke, as SVG path data. A single tap becomes a dot rather than
 * nothing, because a full stop is what some people sign with.
 */
export function pathFromPoints(points: { x: number; y: number }[]): string | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  if (points.length === 1) {
    // A zero-length line with a round cap draws as a dot.
    return `M${round(first.x)} ${round(first.y)}l0 0`;
  }
  const rest = points.slice(1).map((point) => `L${round(point.x)} ${round(point.y)}`);
  return `M${round(first.x)} ${round(first.y)}${rest.join('')}`;
}

export function hasSignature(entry: GuestEntry): boolean {
  return (entry.signaturePaths?.length ?? 0) > 0;
}

function round(value: number): number {
  // Quarter-pixel precision: finer than anyone can see, and a third of the
  // characters of an unrounded float.
  return Math.round(value * 4) / 4;
}

/** Older entries were written before pictures could be picked. */
export function likedOf(entry: GuestEntry): string[] {
  return entry.likedPhotoIds ?? [];
}

/** Toggles a picture in a draft — tapping a liked one again un-likes it. */
export function togglePhotoLike(draft: GuestDraft, photoId: string): GuestDraft {
  const liked = draft.likedPhotoIds.includes(photoId)
    ? draft.likedPhotoIds.filter((id) => id !== photoId)
    : [...draft.likedPhotoIds, photoId];
  return { ...draft, likedPhotoIds: liked };
}

/**
 * How many visitors liked each picture, most-liked first. The artist's answer
 * to "which of these should I bring to the next show?".
 */
export function likeCounts(entries: GuestEntry[]): { photoId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const id of likedOf(entry)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([photoId, count]) => ({ photoId, count }))
    .sort((a, b) => b.count - a.count);
}

export function searchGuests(entries: GuestEntry[], query: string): GuestEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.name, entry.email, entry.phone, entry.show, entry.note]
      .filter((field): field is string => Boolean(field))
      .some((field) => field.toLowerCase().includes(needle)),
  );
}

/** Only the people who agreed to be contacted. The rest are a record, not a list. */
export function mailingList(entries: GuestEntry[]): GuestEntry[] {
  return entries.filter((entry) => entry.consented && entry.email);
}

export function csvOf(entries: GuestEntry[], titleOf?: (photoId: string) => string): string {
  const header = ['Name', 'Email', 'Phone', 'Show', 'Note', 'May contact', 'Liked', 'Signed'];
  const rows = entries.map((entry) => [
    entry.name,
    entry.email ?? '',
    entry.phone ?? '',
    entry.show ?? '',
    entry.note ?? '',
    entry.consented ? 'yes' : 'no',
    // Titles rather than ids: a spreadsheet is read by a person.
    likedOf(entry).map((id) => titleOf?.(id) ?? id).join('; '),
    entry.signedAt,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/**
 * A spreadsheet treats a cell starting with = + - @ as a formula, so a name
 * like "=cmd" would run in Excel. Prefixing an apostrophe keeps the text.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * iOS wants sms:number&body=, Android wants sms:number?body=. The ?/& split
 * is the one browser difference that actually breaks this link.
 */
export function smsLink(to: string, body: string, isApple = isAppleDevice()): string {
  const separator = isApple ? '&' : '?';
  return `sms:${to.replace(/[^\d+]/g, '')}${separator}body=${encodeURIComponent(body)}`;
}

function isAppleDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function digitsOf(value: string | null): string {
  return value ? value.replace(/\D/g, '') : '';
}
