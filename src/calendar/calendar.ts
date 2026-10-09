/**
 * The calendar: every dated thing in the studio, once, in one place.
 * DOM-free.
 *
 * Read off the records each time — shows and their deadlines, commission
 * delivery dates, milestones and private tasks, payments due, client
 * follow-ups — so nothing here is stored and nothing can drift. A thing with
 * no date is not on it: a guessed date would be worse than none.
 *
 * ICS export hands the same list to the phone's own calendar. It is a file
 * the artist imports; nothing subscribes, nothing syncs.
 */
import type { CommissionDocument } from '../commission/types';
import { milestonesOf } from '../commission/milestones';
import { tasksOf } from '../commission/tasks';
import type { OwedRow } from '../finance/owed';
import { isOverdue } from '../finance/owed';
import type { Show } from '../shows/shows';

export type EventKind = 'show' | 'deadline' | 'delivery' | 'milestone' | 'task' | 'payment' | 'followup';

export const KINDS: { id: EventKind; label: string }[] = [
  { id: 'show', label: 'Shows' },
  { id: 'deadline', label: 'Deadlines' },
  { id: 'delivery', label: 'Deliveries' },
  { id: 'milestone', label: 'Milestones' },
  { id: 'task', label: 'Tasks' },
  { id: 'payment', label: 'Payments due' },
  { id: 'followup', label: 'Follow-ups' },
];

export interface CalendarEvent {
  /** Unique and stable: `kind:recordId[:part]`. Also the ICS UID. */
  id: string;
  kind: EventKind;
  /** yyyy-mm-dd. */
  start: string;
  /** yyyy-mm-dd, inclusive. Same as start for a one-day thing. */
  end: string;
  title: string;
  /** "Show", "Application deadline", "Delivery — Lobby triptych"… */
  label: string;
  done: boolean;
  overdue: boolean;
  /** What to open: a show, a commission, an invoice or a client profile. */
  open: { kind: 'show' | 'commission' | 'invoice' | 'client'; id: string };
}

export interface CalendarInput {
  shows: Show[];
  documents: CommissionDocument[];
  owed: OwedRow[];
  followUps: { id: string; date: string; title: string }[];
  today: string;
}

const isDate = (v: string | null | undefined): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function calendarEvents(input: CalendarInput): CalendarEvent[] {
  const { today } = input;
  const out: CalendarEvent[] = [];

  for (const show of input.shows) {
    if (show.status === 'declined') continue;
    if (isDate(show.startDate)) {
      const end = isDate(show.endDate) && show.endDate >= show.startDate ? show.endDate : show.startDate;
      out.push({
        id: `show:${show.id}`, kind: 'show', start: show.startDate, end, title: show.name,
        label: show.venue ? `Show · ${show.venue}` : 'Show', done: end < today, overdue: false,
        open: { kind: 'show', id: show.id },
      });
    }
    if (isDate(show.deadline)) {
      // A deadline only matters while the artist has not yet heard back.
      const settled = show.status === 'accepted' || show.status === 'done';
      out.push({
        id: `deadline:${show.id}`, kind: 'deadline', start: show.deadline, end: show.deadline, title: show.name,
        label: 'Application deadline', done: settled || show.status === 'applied',
        overdue: !settled && show.status !== 'applied' && show.deadline < today,
        open: { kind: 'show', id: show.id },
      });
    }
  }

  for (const doc of input.documents) {
    if (doc.state === 'archived') continue;
    const name = doc.title.trim() || doc.documentNumber;
    const target = doc.schedule.targetCompletionDate;
    const milestones = milestonesOf(doc);
    const allDone = milestones.length > 0 && milestones.every((m) => m.done);
    if (isDate(target)) {
      out.push({
        id: `delivery:${doc.id}`, kind: 'delivery', start: target, end: target, title: name,
        label: 'Delivery', done: allDone, overdue: !allDone && target < today,
        open: { kind: 'commission', id: doc.id },
      });
    }
    for (const m of milestones) {
      if (!isDate(m.date)) continue;
      out.push({
        id: `milestone:${doc.id}:${m.id}`, kind: 'milestone', start: m.date, end: m.date, title: m.label || 'Stage',
        label: name, done: m.done, overdue: !m.done && m.date < today,
        open: { kind: 'commission', id: doc.id },
      });
    }
    for (const t of tasksOf(doc)) {
      if (!isDate(t.due)) continue;
      out.push({
        id: `task:${doc.id}:${t.id}`, kind: 'task', start: t.due, end: t.due, title: t.label,
        label: name, done: t.done, overdue: !t.done && t.due < today,
        open: { kind: 'commission', id: doc.id },
      });
    }
  }

  for (const row of input.owed) {
    if (row.notYetSent || !isDate(row.dueDate)) continue;
    out.push({
      id: `payment:${row.id}`, kind: 'payment', start: row.dueDate, end: row.dueDate,
      title: row.who ? `${row.ref} · ${row.who}` : row.ref, label: 'Payment due', done: false,
      overdue: isOverdue(row, today),
      open: { kind: row.source === 'invoice' ? 'invoice' : 'commission', id: row.recordId },
    });
  }

  for (const f of input.followUps) {
    if (!isDate(f.date)) continue;
    out.push({
      id: `followup:${f.id}`, kind: 'followup', start: f.date, end: f.date, title: f.title,
      label: 'Follow up', done: false, overdue: f.date < today, open: { kind: 'client', id: f.id },
    });
  }

  // Once each: the ids are unique by construction; this is the guard.
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
}

/** The events touching one day (a show spans every day it runs). */
export function eventsOn(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((e) => e.start <= day && e.end >= day);
}

/** yyyy-mm-dd + days, in UTC so no clock change moves it. */
export function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The days a month view draws: whole weeks, Monday first, from the week
 * holding the 1st to the week holding the last day. `month` is yyyy-mm.
 */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const start = shiftDay(first, -weekday);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const days: string[] = [];
  for (let d = start; d <= last || days.length % 7 !== 0; d = shiftDay(d, 1)) days.push(d);
  return days;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** "October 2026". */
export function monthTitle(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}

// --- ICS -----------------------------------------------------------------------

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines over 75 octets are folded, as RFC 5545 asks; calendars reject them otherwise. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (new TextEncoder().encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compact = (iso: string) => iso.replace(/-/g, '');

/**
 * All-day events for the phone's calendar. Done things are left out — a
 * calendar full of finished stages is noise. `stamp` is the export time.
 */
export function toIcs(events: CalendarEvent[], stamp: Date): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Artist OS//Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Studio'];
  for (const e of events) {
    if (e.done) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id.replace(/[^\w:.-]/g, '')}@artist-os`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      // DTEND is exclusive for all-day events: the day after the last.
      `DTEND;VALUE=DATE:${compact(shiftDay(e.end, 1))}`,
      `SUMMARY:${icsText(`${e.title} — ${e.label}`)}`,
      `CATEGORIES:${icsText(KINDS.find((k) => k.id === e.kind)!.label)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
