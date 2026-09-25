import { describe, expect, it } from 'vitest';
import {
  boothFees,
  createShow,
  deadlinesAhead,
  describeStatus,
  editShow,
  guestsAt,
  showProblem,
  addPiece,
  removePiece,
  feeExpense,
  feeExpenseId,
  pickableShows,
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
  it('marks a piece at the show, once, and puts it back where it was', () => {
    const added = addPiece(show(), { id: 'p1', location: 'gallery' }, now);
    expect(added.location).toBe('show');
    expect(addPiece(added.show, { id: 'p1', location: 'show' }, now).show.pieceIds).toEqual(['p1']);
    const back = removePiece(added.show, { id: 'p1', location: 'show' }, [added.show], now);
    expect(back.show.pieceIds).toEqual([]);
    expect(back.location).toBe('gallery');
  });

  it('leaves a piece alone that moved since, or is at another show', () => {
    const a = addPiece(show(), { id: 'p1', location: null }, now).show;
    expect(removePiece(a, { id: 'p1', location: 'client' }, [a], now).location).toBeUndefined();
    const b = addPiece(show({ name: 'B' }), { id: 'p1', location: 'show' }, now).show;
    expect(removePiece(a, { id: 'p1', location: 'show' }, [a, b], now).location).toBeUndefined();
    expect(removePiece(a, { id: 'p1', location: 'show' }, [a], now).location).toBeNull();
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

describe('the booth fee in the books', () => {
  it('keeps no row until the artist is in', () => {
    for (const status of [null, 'considering', 'applied', 'declined'] as const) {
      expect(feeExpense(show({ status, boothFee: 100 }), null, '2026-09-01', now)).toBeNull();
    }
  });

  it('writes one row per show, null amount when not recorded, keeping receipts', () => {
    const accepted = show({ status: 'accepted', startDate: '2026-10-03' });
    const row = feeExpense(accepted, null, '2026-09-01', now);
    expect(row).toMatchObject({ id: feeExpenseId(accepted.id), category: 'fees', amount: null, date: '2026-10-03' });
    const later = feeExpense(
      editShow(accepted, { boothFee: 25000 }, now),
      { ...row!, receiptImageIds: ['r1'], note: 'paid by card' },
      '2026-09-01',
      now,
    );
    expect(later).toMatchObject({ amount: 25000, receiptImageIds: ['r1'], note: 'paid by card' });
  });
});

describe('picking a show in the guest book', () => {
  it('puts the running show first and leaves declined out', () => {
    const shows = [
      show({ name: 'Past', startDate: '2026-01-01' }),
      show({ name: 'Declined', status: 'declined' }),
      show({ name: 'On', startDate: '2026-09-01', endDate: '2026-09-03' }),
      show({ name: 'Next', startDate: '2026-12-01' }),
    ];
    expect(pickableShows(shows, '2026-09-02').map((s) => s.name)).toEqual(['On', 'Next', 'Past']);
  });
});
