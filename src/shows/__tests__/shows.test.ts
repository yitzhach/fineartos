import { describe, expect, it } from 'vitest';
import {
  boothFees,
  createShow,
  deadlinesAhead,
  describeStatus,
  editShow,
  guestsAt,
  showProblem,
  togglePiece,
  whenIs,
} from '../shows';
import type { GuestEntry } from '../../connect/guestbook';

const now = new Date('2026-09-01T00:00:00Z');
const show = (over = {}) => editShow(createShow('Autumn Fair', now), over, now);
const guest = (name: string, showName: string | null): GuestEntry => ({
  id: name,
  name,
  email: null,
  phone: null,
  show: showName,
  note: null,
  consented: false,
  likedPhotoIds: [],
  signaturePaths: null,
  signedAt: now.toISOString(),
});

describe('a new show', () => {
  it('starts with nothing assumed', () => {
    const fresh = createShow('  Autumn Fair ', now);
    expect(fresh.name).toBe('Autumn Fair');
    expect(fresh.boothFee).toBeNull();
    expect(fresh.status).toBeNull();
    expect(describeStatus(fresh.status)).toBe('Not said');
  });

  it('refuses no name, backwards dates and a negative fee', () => {
    expect(showProblem(show({ name: ' ' }))).toMatch(/name/);
    expect(showProblem(show({ startDate: '2026-10-05', endDate: '2026-10-04' }))).toMatch(/ends/);
    expect(showProblem(show({ boothFee: -1 }))).toMatch(/negative/);
    expect(showProblem(show({ boothFee: 0 }))).toBeNull();
  });
});

describe('pieces and guests', () => {
  it('lists a piece once and takes it off again', () => {
    const one = togglePiece(show(), 'p1', now);
    expect(togglePiece(one, 'p2', now).pieceIds).toEqual(['p1', 'p2']);
    expect(togglePiece(one, 'p1', now).pieceIds).toEqual([]);
  });

  it('finds guest entries by the show name as typed', () => {
    const guests = [guest('a', 'autumn fair '), guest('b', 'Spring'), guest('c', null)];
    expect(guestsAt(show(), guests).map((g) => g.id)).toEqual(['a']);
  });
});

describe('dates, deadlines and fees', () => {
  it('places a show against today', () => {
    expect(whenIs(show(), '2026-10-01')).toBe('undated');
    const dated = show({ startDate: '2026-10-03', endDate: '2026-10-05' });
    expect(whenIs(dated, '2026-10-01')).toBe('upcoming');
    expect(whenIs(dated, '2026-10-05')).toBe('on');
    expect(whenIs(dated, '2026-10-06')).toBe('past');
    expect(whenIs(show({ startDate: '2026-10-03' }), '2026-10-03')).toBe('on');
  });

  it('lists deadlines ahead, soonest first, not for declined or done', () => {
    const shows = [
      show({ name: 'Late', deadline: '2026-11-01' }),
      show({ name: 'Soon', deadline: '2026-09-10' }),
      show({ name: 'Gone', deadline: '2026-08-01' }),
      show({ name: 'No', deadline: '2026-09-20', status: 'declined' }),
    ];
    expect(deadlinesAhead(shows, '2026-09-05').map((s) => s.name)).toEqual(['Soon', 'Late']);
  });

  it('totals booth fees and says how many were not recorded', () => {
    expect(boothFees([show({ boothFee: 15000 }), show({ boothFee: 0 }), show()])).toEqual({
      total: 15000,
      notRecorded: 1,
    });
  });
});
