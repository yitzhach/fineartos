import { describe, expect, it } from 'vitest';
import { createDocument } from '../../commission/document';
import { createMilestone, addMilestone } from '../../commission/milestones';
import { addTask, createTask } from '../../commission/tasks';
import { createShow, editShow } from '../../shows/shows';
import type { OwedRow } from '../../finance/owed';
import { calendarEvents, eventsOn, monthGrid, shiftMonth, toIcs, monthTitle } from '../calendar';

const now = new Date('2026-10-09T12:00:00Z');
const today = '2026-10-09';
const show = editShow(createShow('Spring Market', now), { startDate: '2026-10-10', endDate: '2026-10-12', deadline: '2026-09-01', status: 'considering', venue: 'Pier 3' }, now);
const declined = editShow(createShow('Nope Fair', now), { startDate: '2026-10-15', status: 'declined' }, now);
let doc = createDocument('AO-2026-0001', now);
doc = { ...doc, title: 'Lobby triptych', schedule: { ...doc.schedule, targetCompletionDate: '2026-11-01' } };
doc = addMilestone(doc, createMilestone('Underpainting', '2026-10-05'));
doc = addMilestone(doc, createMilestone('Undated'));
doc = addTask(doc, createTask('Order linen', '2026-10-11'));
doc = addTask(doc, createTask('No date'));
const owed = [
  { id: 'invoice:i1', source: 'invoice', recordId: 'i1', ref: 'INV-2026-0001', who: 'Ana', dueDate: '2026-10-20', notYetSent: false },
  { id: 'invoice:i2', source: 'invoice', recordId: 'i2', ref: 'INV-2026-0002', who: null, dueDate: '2026-10-20', notYetSent: true },
  { id: 'commission:c', source: 'commission', recordId: 'c', ref: 'AO', who: null, dueDate: null, notYetSent: false },
] as unknown as OwedRow[];
const events = calendarEvents({ shows: [show, declined], documents: [doc], owed, followUps: [{ id: 'p1', date: '2026-10-08', title: 'Bo' }], today });

describe('every dated thing, once', () => {
  it('collects each kind, leaves the undated and the declined out', () => {
    expect(events.map((e) => `${e.kind}:${e.start}`)).toEqual([
      'deadline:2026-09-01',
      'milestone:2026-10-05',
      'followup:2026-10-08',
      'show:2026-10-10',
      'task:2026-10-11',
      'payment:2026-10-20',
      'delivery:2026-11-01',
    ]);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
  it('says what is overdue, and what is done', () => {
    const by = (k: string) => events.find((e) => e.kind === k)!;
    expect(by('deadline').overdue).toBe(true);
    expect(by('milestone').overdue).toBe(true);
    expect(by('followup').overdue).toBe(true);
    expect(by('payment').overdue).toBe(false);
    expect(by('show').end).toBe('2026-10-12');
    expect(by('show').label).toBe('Show · Pier 3');
    expect(by('payment').open).toEqual({ kind: 'invoice', id: 'i1' });
    expect(by('task').open).toEqual({ kind: 'commission', id: doc.id });
  });
  it('a show sits on every day it runs', () => {
    expect(eventsOn(events, '2026-10-11').map((e) => e.kind)).toEqual(['show', 'task']);
    expect(eventsOn(events, '2026-10-13')).toEqual([]);
  });
});

describe('the month', () => {
  it('whole weeks, Monday first', () => {
    const grid = monthGrid('2026-10');
    expect(grid[0]).toBe('2026-09-28');
    expect(grid.at(-1)).toBe('2026-11-01');
    expect(grid.length % 7).toBe(0);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthTitle('2026-10')).toBe('October 2026');
  });
});

describe('ICS for the phone', () => {
  const ics = toIcs(events, new Date('2026-10-09T12:34:56Z'));
  it('all-day events with an exclusive end, escaped, CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261013');
    expect(ics).toContain('SUMMARY:Spring Market — Show · Pier 3');
    expect(ics).toContain('DTSTAMP:20261009T123456Z');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(events.filter((e) => !e.done).length);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('escapes commas and semicolons, folds long lines', () => {
    const long = calendarEvents({ shows: [editShow(createShow('A, B; C ' + 'x'.repeat(90), now), { startDate: '2026-10-10' }, now)], documents: [], owed: [], followUps: [], today });
    const out = toIcs(long, now);
    expect(out).toContain('SUMMARY:A\\, B\; C');
    expect(out.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
});
