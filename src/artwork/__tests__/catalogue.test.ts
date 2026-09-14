import { describe, expect, it } from 'vitest';
import { createPhoto, editPhoto, type Photo } from '../../photo/photo';
import {
  askingInMinor,
  catalogueCsv,
  clientLine,
  clientPieces,
  describeLocation,
  describeSummary,
  emptySale,
  isSold,
  netOf,
  saleYears,
  salesCsv,
  salesTotal,
  shownPieces,
  soldPieces,
  sortPieces,
  summarise,
  type Sale,
} from '../catalogue';

const piece = (title: string, changes: Partial<Photo> = {}, createdAt?: string): Photo => {
  const made = editPhoto(
    createPhoto({ imageId: `img-${title}`, title, pixelWidth: 100, pixelHeight: 100 }),
    changes,
  );
  return createdAt ? { ...made, createdAt } : made;
};

const sale = (over: Partial<Sale> = {}): Sale => ({ ...emptySale('2026-04-02'), ...over });

describe('a sale', () => {
  it('starts with nothing but a date, because that is all a sale always has', () => {
    const fresh = emptySale('2026-04-02');
    expect(fresh.date).toBe('2026-04-02');
    expect(fresh.amount).toBeNull();
    expect(fresh.fee).toBeNull();
  });

  it('keeps what was kept, and refuses to guess when it cannot', () => {
    expect(netOf(sale({ amount: 120000, fee: 48000 }))).toBe(72000);
    // No fee recorded is not a fee of nothing — but the amount still stands.
    expect(netOf(sale({ amount: 120000 }))).toBe(120000);
    // No amount at all: there is no net to state.
    expect(netOf(sale({ fee: 48000 }))).toBeNull();
  });

  it('reads the asking price into the money the rest of the app uses', () => {
    expect(askingInMinor(piece('A', { price: 5200 }))).toBe(520000);
    expect(askingInMinor(piece('B'))).toBeNull();
  });

  it('counts a piece as sold when the artist said so, either way round', () => {
    expect(isSold(piece('A'))).toBe(false);
    expect(isSold(piece('B', { status: 'sold' }))).toBe(true);
    expect(isSold(piece('C', { sale: sale({ amount: 90000 }) }))).toBe(true);
  });

  it('says where a piece is, or that nobody said', () => {
    expect(describeLocation('gallery')).toBe('With a gallery');
    expect(describeLocation(null)).toBe('Not said');
    expect(describeLocation(undefined)).toBe('Not said');
  });
});

describe('looking through them', () => {
  const all = [
    piece('Harbour', { price: 5200, status: 'available', medium: 'Oil on linen' }, '2026-01-01T00:00:00Z'),
    piece('Kiln', { status: 'sold', sale: sale({ amount: 90000, buyer: 'Ruiz' }) }, '2026-02-01T00:00:00Z'),
    piece('Study', { price: 400, status: 'nfs' }, '2026-03-01T00:00:00Z'),
    piece('Untitled', {}, '2026-04-01T00:00:00Z'),
  ];

  it('filters by what the artist actually marked', () => {
    const titles = (filter: Parameters<typeof shownPieces>[1]['filter']) =>
      shownPieces(all, { filter, query: '', sort: 'title' }).map((one) => one.title);
    expect(titles('available')).toEqual(['Harbour']);
    expect(titles('sold')).toEqual(['Kiln']);
    expect(titles('nfs')).toEqual(['Study']);
    expect(titles('unsaid')).toEqual(['Untitled']);
    expect(titles('unpriced')).toEqual(['Kiln', 'Untitled']);
    expect(titles('all')).toHaveLength(4);
  });

  it('searches the things a person would type, including who bought it', () => {
    const found = (query: string) =>
      shownPieces(all, { filter: 'all', query, sort: 'title' }).map((one) => one.title);
    expect(found('linen')).toEqual(['Harbour']);
    expect(found('ruiz')).toEqual(['Kiln']);
    expect(found('  ')).toHaveLength(4);
  });

  it('sorts newest first by default, and by title, size and price on request', () => {
    expect(sortPieces(all, 'newest')[0]!.title).toBe('Untitled');
    expect(sortPieces(all, 'oldest')[0]!.title).toBe('Harbour');
    expect(sortPieces(all, 'title')[0]!.title).toBe('Harbour');
    expect(sortPieces(all, 'price-high')[0]!.title).toBe('Harbour');
  });

  it('does not read an unpriced piece as a cheap one', () => {
    const cheapest = sortPieces(all, 'price-low').map((one) => one.price);
    // The two with no price go last either way rather than sorting as zero.
    expect(cheapest.slice(0, 2)).toEqual([400, 5200]);
    expect(cheapest.slice(2)).toEqual([null, null]);
  });
});

describe('counting', () => {
  const all = [
    piece('A', { price: 5200, status: 'available' }),
    piece('B', { status: 'sold', sale: sale({ amount: 90000 }) }),
    piece('C', {}),
  ];

  it('counts what is there without inventing what is not', () => {
    expect(summarise(all)).toEqual({ total: 3, available: 1, sold: 1, nfs: 0, unsaid: 1, unpriced: 2 });
  });

  it('says it in words, and says nothing when there is nothing', () => {
    expect(describeSummary(summarise(all))).toBe('3 pieces · 1 available · 1 sold · 2 with no price yet');
    expect(describeSummary(summarise([]))).toBe('Nothing in the catalogue yet');
  });
});

describe('the money', () => {
  const all = [
    piece('A', { sale: { ...sale({ amount: 120000, fee: 48000 }), date: '2026-04-02' } }),
    piece('B', { sale: { ...sale({ amount: 90000 }), date: '2026-05-11' } }),
    // Sold, but nobody wrote the figure down.
    piece('C', { sale: { ...sale(), date: '2026-06-01' } }),
    piece('D', { sale: { ...sale({ amount: 50000 }), date: '2025-11-04' } }),
  ];

  it('adds up only what it can see, and says how much it could not', () => {
    const total = salesTotal(all, 2026);
    expect(total.gross).toBe(210000);
    expect(total.net).toBe(162000);
    expect(total.counted).toBe(2);
    // The third 2026 sale has no figure: left out of the total, and said so.
    expect(total.missing).toBe(1);
  });

  it('keeps the years apart', () => {
    expect(salesTotal(all, 2025).gross).toBe(50000);
    expect(saleYears(all)).toEqual([2026, 2025]);
  });

  it('lists what sold, newest first', () => {
    expect(soldPieces(all, 2026).map((one) => one.title)).toEqual(['C', 'B', 'A']);
  });
});

describe('handing it to a spreadsheet', () => {
  const all = [
    piece('Harbour', {
      price: 5200,
      status: 'sold',
      widthIn: 24,
      heightIn: 36,
      sale: { ...sale({ amount: 520000, fee: 156000, where: 'Santa Fe', buyer: 'Ruiz' }) },
    }),
    piece('Untitled'),
  ];

  it('leaves a cell empty rather than writing a nought nobody said', () => {
    const csv = catalogueCsv(all);
    const [, , untitled] = csv.split('\r\n');
    expect(untitled).toContain('"Untitled"');
    expect(untitled).not.toContain('"0"');
    expect(untitled).not.toContain('0.00');
  });

  it('writes the figures a spreadsheet can add up', () => {
    const csv = salesCsv(all);
    expect(csv).toContain('"5200.00"');
    expect(csv).toContain('"1560.00"');
    // What was kept: 5200 less the 1560 the gallery took.
    expect(csv).toContain('"3640.00"');
    expect(csv).toContain('"Ruiz"');
  });

  it('will not let a title run as a formula in Excel', () => {
    const csv = catalogueCsv([piece('=cmd|calc')]);
    expect(csv).toContain(`"'=cmd|calc"`);
  });
});

describe('what a client sees', () => {
  it('never quotes what something sold for', () => {
    const sold = piece('Kiln', { price: 900, status: 'sold', sale: sale({ amount: 90000 }) });
    expect(clientLine(sold)).toContain('Sold');
    expect(clientLine(sold)).not.toContain('900');
  });

  it('says price on request rather than an empty space', () => {
    expect(clientLine(piece('Untitled'))).toContain('Price on request');
  });

  it('can leave the sold work out of the library entirely', () => {
    const all = [piece('A', { status: 'sold' }), piece('B', { status: 'available' })];
    expect(clientPieces(all, { showSold: false }).map((one) => one.title)).toEqual(['B']);
    expect(clientPieces(all, { showSold: true })).toHaveLength(2);
  });
});
