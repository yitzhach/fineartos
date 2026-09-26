/**
 * Coming up: the few dated things an artist should not miss, read off the
 * records. Nothing here is stored — it is worked out from shows and money
 * owed each time, so it cannot drift from what is true.
 *
 * DOM-free, like the rest of the model layer.
 */
import { isOverdue, type OwedRow } from '../finance/owed';
import { deadlinesAhead, type Show } from '../shows/shows';

export type ComingKind = 'deadline' | 'show' | 'payment';

export interface ComingItem {
  id: string;
  kind: ComingKind;
  /** yyyy-mm-dd. */
  date: string;
  title: string;
  /** "Deadline", "Starts", "On now", "Payment due", "Payment overdue". */
  label: string;
  overdue: boolean;
  /** The record to open. */
  openId: string;
}

/** yyyy-mm-dd plus whole days, in UTC so no clock change shifts it. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Everything dated from today up to `horizon` days out, plus any payment
 * already overdue, soonest first. A payment with no due date is left out:
 * nobody agreed a date, so it is not "coming up".
 */
export function comingUp(input: {
  shows: Show[];
  owed: OwedRow[];
  today: string;
  horizon?: number;
}): ComingItem[] {
  const { shows, owed, today } = input;
  const until = addDays(today, input.horizon ?? 30);
  const items: ComingItem[] = [];

  for (const show of deadlinesAhead(shows, today)) {
    if (show.deadline && show.deadline <= until) {
      items.push({ id: `deadline:${show.id}`, kind: 'deadline', date: show.deadline, title: show.name, label: 'Deadline', overdue: false, openId: show.id });
    }
  }

  for (const show of shows) {
    if (!show.startDate || show.status === 'declined') continue;
    const end = show.endDate ?? show.startDate;
    if (show.startDate <= today && end >= today) {
      items.push({ id: `show:${show.id}`, kind: 'show', date: today, title: show.name, label: 'On now', overdue: false, openId: show.id });
    } else if (show.startDate > today && show.startDate <= until) {
      items.push({ id: `show:${show.id}`, kind: 'show', date: show.startDate, title: show.name, label: 'Starts', overdue: false, openId: show.id });
    }
  }

  for (const row of owed) {
    if (row.notYetSent || row.dueDate === null) continue;
    const overdue = isOverdue(row, today);
    if (!overdue && row.dueDate > until) continue;
    items.push({
      id: `payment:${row.id}`,
      kind: 'payment',
      date: row.dueDate,
      title: row.who ? `${row.ref} · ${row.who}` : row.ref,
      label: overdue ? 'Payment overdue' : 'Payment due',
      overdue,
      openId: row.recordId,
    });
  }

  // Overdue first, then by date.
  return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date));
}
