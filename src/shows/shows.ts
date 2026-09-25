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
import type { PieceLocation } from '../artwork/catalogue';
import type { Expense } from '../finance/ledger';

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
  /**
   * Where each piece was before the show took it, so taking it back off puts
   * it where it was rather than guessing "studio".
   */
  priorLocations: Record<string, PieceLocation | null>;
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
    priorLocations: {},
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

/** A piece going to a show: listed once, and its location becomes "At a show". */
export function addPiece(
  show: Show,
  piece: { id: string; location?: PieceLocation | null },
  now = new Date(),
): { show: Show; location: PieceLocation } {
  if (show.pieceIds.includes(piece.id)) return { show, location: 'show' };
  return {
    show: editShow(
      show,
      {
        pieceIds: [...show.pieceIds, piece.id],
        priorLocations: { ...show.priorLocations, [piece.id]: piece.location ?? null },
      },
      now,
    ),
    location: 'show',
  };
}

/**
 * A piece coming off a show. Its location goes back to where it was — but
 * only if it still reads "At a show" and no other show holds it. If the
 * artist has moved it since (sold, say), that is left alone: `location` is
 * undefined, meaning "do not touch".
 */
export function removePiece(
  show: Show,
  piece: { id: string; location?: PieceLocation | null },
  allShows: Show[],
  now = new Date(),
): { show: Show; location: PieceLocation | null | undefined } {
  const { [piece.id]: prior, ...rest } = show.priorLocations;
  const next = editShow(
    show,
    { pieceIds: show.pieceIds.filter((id) => id !== piece.id), priorLocations: rest },
    now,
  );
  const elsewhere = allShows.some((other) => other.id !== show.id && other.pieceIds.includes(piece.id));
  const restore = piece.location === 'show' && !elsewhere;
  return { show: next, location: restore ? (prior ?? null) : undefined };
}

/** The id of the books row a show's booth fee is kept in. One per show. */
export function feeExpenseId(showId: string): string {
  return `show-fee:${showId}`;
}

/**
 * The booth fee as a row in the books, or null when there should be none.
 *
 * A fee is spent once the artist is in: accepted or done. Considering,
 * applied and declined keep no row. A fee not recorded stays a null amount,
 * so the books count it as left out rather than as $0. Anything the artist
 * added on the books side — receipts, a note — is kept.
 */
export function feeExpense(show: Show, existing: Expense | null, today: string, now = new Date()): Expense | null {
  if (show.status !== 'accepted' && show.status !== 'done') return null;
  const iso = now.toISOString();
  return {
    id: feeExpenseId(show.id),
    date: show.startDate ?? existing?.date ?? today,
    category: 'fees',
    what: `Booth fee — ${show.name.trim()}`,
    amount: show.boothFee,
    miles: null,
    ratePerMile: null,
    receiptImageIds: existing?.receiptImageIds ?? [],
    jobRef: show.name.trim() || null,
    note: existing?.note ?? null,
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
}

/** Shows a guest can be signed in at: not declined, soonest-running first. */
export function pickableShows(shows: Show[], today: string): Show[] {
  const rank = (show: Show) => ({ on: 0, upcoming: 1, undated: 2, past: 3 })[whenIs(show, today)];
  return shows
    .filter((show) => show.status !== 'declined' && show.name.trim())
    .sort((a, b) => rank(a) - rank(b) || (a.startDate ?? '').localeCompare(b.startDate ?? ''));
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

/** Today as yyyy-mm-dd in the artist's own time zone. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Oct 3 – 5, 2026" style range, or null when no date is set. */
export function describeDates(show: Show): string | null {
  if (!show.startDate) return null;
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  if (!show.endDate || show.endDate === show.startDate) return fmt(show.startDate);
  return `${fmt(show.startDate)} – ${fmt(show.endDate)}`;
}
