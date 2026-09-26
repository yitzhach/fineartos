import { describe, expect, it } from 'vitest';
import { addDays, comingUp } from '../dashboard';
import { createShow, editShow } from '../../shows/shows';
import type { OwedRow } from '../../finance/owed';

const show = (over = {}) => editShow(createShow('Fair'), over);
const owed = (over: Partial<OwedRow> = {}): OwedRow => ({
  id: 'invoice:1', source: 'invoice', recordId: '1', ref: 'INV-1', who: 'Ann', what: '', currency: 'USD',
  total: 100, paid: 0, due: 100, dueDate: '2026-10-01', since: '2026-09-01', notYetSent: false,
  ...over,
} as OwedRow);

describe('coming up', () => {
  const today = '2026-09-26';

  it('adds days across a month end', () => {
    expect(addDays('2026-09-26', 10)).toBe('2026-10-06');
  });

  it('lists deadlines and starts inside the horizon, not beyond or declined', () => {
    const items = comingUp({
      shows: [
        show({ name: 'Soon', deadline: '2026-10-01', startDate: '2026-10-10' }),
        show({ name: 'Far', deadline: '2026-12-01' }),
        show({ name: 'No', startDate: '2026-10-02', status: 'declined' }),
        show({ name: 'Now', startDate: '2026-09-25', endDate: '2026-09-27' }),
      ],
      owed: [],
      today,
    });
    expect(items.map((i) => `${i.label} ${i.title}`)).toEqual(['On now Now', 'Deadline Soon', 'Starts Soon']);
  });

  it('puts overdue payments first and leaves out undated and draft ones', () => {
    const items = comingUp({
      shows: [show({ name: 'S', deadline: '2026-09-27' })],
      owed: [
        owed({ id: 'a', dueDate: '2026-09-01' }),
        owed({ id: 'b', dueDate: null }),
        owed({ id: 'c', dueDate: '2026-09-20', notYetSent: true }),
        owed({ id: 'd', dueDate: '2026-10-05' }),
      ],
      today,
    });
    expect(items.map((i) => i.id)).toEqual(['payment:a', `deadline:${items[1]!.openId}`, 'payment:d']);
    expect(items[0]!.label).toBe('Payment overdue');
  });
});
