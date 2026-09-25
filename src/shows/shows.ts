/**
 * Shows: the event, not the pieces. Artwork owns each piece and where it is;
 * a show only lists which pieces it took. Finance reads both.
 *
 * Unknown stays unknown: a booth fee nobody recorded is null, never zero, and
 * a status is "Not said" until the artist says it.
 */
import { newId } from '../commission/document';
import type { Minor } from '../commission/types';
import type { GuestEntry } from '../connect/guestbook';

export type ShowStatus = 'considering' | 'applied' | 'accepted' | 'declined' | 'done';

export const SHOW_STATUSES: { id: ShowStatus; label: string }[] = [
  { id: 'considering', label: 'Considering' },
  { id: 'applied', label: 'Applied' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' },
  { id: 'done', label: 'Done' },
];

export interface Show {
  id: string;
  name: string;
  venue: string | null;
  /** yyyy-mm-dd. Null = not set. */
  startDate: string | null;
  /** yyyy-mm-dd. Null = a one-day show, or not set. */
  endDate: string | null;
  /** Minor units. Null = not recorded, never zero. */
  boothFee: Minor | null;
  /** Application or drop-off deadline, yyyy-mm-dd. */
  deadline: string | null;
  /** Null until the artist says. */
  status: ShowStatus | null;
  /** Artwork photo ids taken to the show. */
  pieceIds: string[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createShow(name: string, now = new Date()): Show {
  const at = now.toISOString();
  return {
    id: newId(),
    name: name.trim(),
    venue: null,
    startDate: null,
    endDate: null,
    boothFee: null,
    deadline: null,
    status: null,
    pieceIds: [],
    note: null,
    createdAt: at,
    updatedAt: at,
  };
}

export function editShow(show: Show, changes: Partial<Omit<Show, 'id' | 'createdAt'>>, now = new Date()): Show {
  return { ...show, ...changes, updatedAt: now.toISOString() };
}

/** What is wrong with a show before it can be saved, or null. */
export function showProblem(show: Show): string | null {
  if (!show.name.trim()) return 'A show needs a name.';
  if (show.startDate && show.endDate && show.endDate < show.startDate) {
    return 'The show ends before it starts.';
  }
  if (show.boothFee !== null && show.boothFee < 0) return 'A booth fee cannot be negative.';
  return null;
}

export function describeStatus(status: ShowStatus | null): string {
  return SHOW_STATUSES.find((one) => one.id === status)?.label ?? 'Not said';
}

/** Adds or removes a piece; a piece is listed once at most. */
export function togglePiece(show: Show, pieceId: string, now = new Date()): Show {
  const pieceIds = show.pieceIds.includes(pieceId)
    ? show.pieceIds.filter((id) => id !== pieceId)
    : [...show.pieceIds, pieceId];
  return editShow(show, { pieceIds }, now);
}

/**
 * Guest-book entries for a show. The guest book stores the show's name as
 * typed, so this matches on the name, ignoring case and surrounding space.
 */
export function guestsAt(show: Show, guests: GuestEntry[]): GuestEntry[] {
  const key = show.name.trim().toLowerCase();
  if (!key) return [];
  return guests.filter((guest) => guest.show?.trim().toLowerCase() === key);
}

export type ShowWhen = 'upcoming' | 'on' | 'past' | 'undated';

/** Where a show sits against today (yyyy-mm-dd). */
export function whenIs(show: Show, today: string): ShowWhen {
  if (!show.startDate) return 'undated';
  const end = show.endDate ?? show.startDate;
  if (today < show.startDate) return 'upcoming';
  if (today > end) return 'past';
  return 'on';
}

/** Deadlines still ahead or today, soonest first, skipping declined and done. */
export function deadlinesAhead(shows: Show[], today: string): Show[] {
  return shows
    .filter((show) => show.deadline !== null && show.deadline >= today)
    .filter((show) => show.status !== 'declined' && show.status !== 'done')
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
}

/** Booth fees across shows: the sum of recorded ones, and how many had none. */
export function boothFees(shows: Show[]): { total: Minor; notRecorded: number } {
  let total = 0;
  let notRecorded = 0;
  for (const show of shows) {
    if (show.boothFee === null) notRecorded += 1;
    else total += show.boothFee;
  }
  return { total, notRecorded };
}
