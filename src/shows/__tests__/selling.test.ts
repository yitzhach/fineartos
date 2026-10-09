import { describe, expect, it } from 'vitest';
import { createPhoto, editPhoto, type Photo } from '../../photo/photo';
import { incomeFromPieces } from '../../finance/income';
import { createShow, editShow } from '../shows';
import {
  cannotSell,
  describeTally,
  dropTrashedSale,
  putSaleBack,
  receiptText,
  saleDefaults,
  sellAtShow,
  showTally,
  trashSale,
  trashableSale,
} from '../selling';

const now = new Date('2026-10-09T15:00:00Z');
const piece = (title: string, over: Partial<Photo> = {}): Photo =>
  editPhoto(createPhoto({ imageId: `img-${title}`, title, pixelWidth: 10, pixelHeight: 10 }, now), over, now);
const fair = () => editShow(createShow('Autumn Fair', now), {}, now);

describe('selling at a show', () => {
  it('starts from the asking price, and an unpriced piece stays unknown', () => {
    expect(saleDefaults(piece('A', { price: 1200 }))).toEqual({ amount: 120000, buyer: null });
    expect(saleDefaults(piece('B'))).toEqual({ amount: null, buyer: null });
  });

  it('one sale changes the piece and the books together', () => {
    const show = fair();
    const before = piece('River', { price: 800, status: 'available', location: 'show' });
    const sold = sellAtShow(before, show, { amount: 80000, buyer: '  Ana ' }, '2026-10-09', now);
    expect(sold.status).toBe('sold');
    expect(sold.location).toBe('client');
    expect(sold.sale).toMatchObject({ showId: show.id, where: 'Autumn Fair', amount: 80000, buyer: 'Ana', fee: null, date: '2026-10-09' });
    expect(sold.sale!.before).toEqual({ status: 'available', location: 'show' });
    expect(incomeFromPieces([sold])).toEqual([
      expect.objectContaining({ amount: 80000, photoId: sold.id, date: '2026-10-09', who: 'Ana' }),
    ]);
  });

  it('will not sell a piece twice, or one not for sale', () => {
    const sold = sellAtShow(piece('A'), fair(), { amount: null, buyer: null }, '2026-10-09', now);
    expect(cannotSell(sold)).toBe('Already sold.');
    expect(cannotSell(piece('B', { status: 'nfs' }))).toBe('Marked not for sale.');
    expect(cannotSell(piece('C'))).toBeNull();
  });
});

describe('the Trash undoes a sale exactly', () => {
  const show = fair();
  const before = piece('River', { status: 'available', location: 'show' });
  const sold = sellAtShow(before, show, { amount: 50000, buyer: null }, '2026-10-09', now);
  const id = sold.sale!.id!;

  it('trashing puts the piece back as it was, out of the books, sale kept', () => {
    const back = trashSale(sold, id, now)!;
    expect(back.status).toBe('available');
    expect(back.location).toBe('show');
    expect(back.sale).toBeNull();
    expect(back.trashedSales).toEqual([sold.sale]);
    expect(incomeFromPieces([back])).toEqual([]);
    expect(showTally(editShow(show, { pieceIds: [back.id] }, now), [back]).sold).toEqual([]);
  });

  it('an edit to the piece meanwhile keeps the trashed sale', () => {
    const edited = editPhoto(trashSale(sold, id, now)!, { title: 'River II' }, now);
    expect(edited.trashedSales).toHaveLength(1);
  });

  it('Put back restores it', () => {
    const restored = putSaleBack(trashSale(sold, id, now)!, id, now) as Photo;
    expect(restored.sale).toEqual(sold.sale);
    expect(restored.status).toBe('sold');
    expect(restored.trashedSales).toEqual([]);
  });

  it('Put back refuses when the piece sold again since', () => {
    const again = sellAtShow(trashSale(sold, id, now)!, show, { amount: 1, buyer: null }, '2026-10-10', now);
    expect(typeof putSaleBack(again, id, now)).toBe('string');
  });

  it('emptying drops it for good', () => {
    const gone = dropTrashedSale(trashSale(sold, id, now)!, id, now)!;
    expect(gone.trashedSales).toBeUndefined();
    expect(dropTrashedSale(gone, id, now)).toBeNull();
  });

  it('a hand-written older sale is not trashable on its own', () => {
    const old = piece('Old', { sale: { date: '2025-01-01', amount: 1, where: null, buyer: null, fee: null, note: null } });
    expect(trashableSale(old)).toBeNull();
    expect(trashSale(old, 'x', now)).toBeNull();
    expect(trashableSale(sold)).toBe(sold.sale);
  });
});

describe("the show's tally", () => {
  it('counts sales, says what has no figure, and what is still out', () => {
    const base = fair();
    const a = piece('A'), b = piece('B'), c = piece('C'), d = piece('D');
    const show = editShow(base, { pieceIds: [a.id, b.id, c.id, d.id] }, now);
    const soldA = sellAtShow(a, show, { amount: 30000, buyer: null }, '2026-10-09', now);
    const soldB = sellAtShow(b, show, { amount: null, buyer: null }, '2026-10-09', now);
    const elsewhere = sellAtShow(d, createShow('Other', now), { amount: 9, buyer: null }, '2026-10-09', now);
    const tally = showTally(show, [soldA, soldB, c, elsewhere]);
    expect(tally.sold.map((p) => p.title)).toEqual(['A', 'B']);
    expect(tally.totals).toEqual([{ currency: 'USD', amount: 30000 }]);
    expect(tally.missing).toBe(1);
    expect(tally.stillOut.map((p) => p.title)).toEqual(['C']);
    expect(describeTally(tally)).toBe('2 sold · $300.00 · 1 with no price recorded, left out · 1 still out');
  });
});

describe('the receipt', () => {
  it('says what and how much, and leaves an unknown amount off', () => {
    const show = fair();
    const sold = sellAtShow(piece('River', { widthIn: 24, heightIn: 36 }), show, { amount: 80000, buyer: 'Ana' }, '2026-10-09', now);
    const r = receiptText(sold, 'Isaac Anderson Art');
    expect(r.subject).toBe('Receipt — River');
    expect(r.body).toContain('Thank you, Ana.');
    expect(r.body).toContain('Amount: $800.00');
    expect(r.body).toContain('24 × 36 in');
    const unknown = sellAtShow(piece('Lake'), show, { amount: null, buyer: null }, '2026-10-09', now);
    expect(receiptText(unknown, null).body).not.toMatch(/Amount|\$0/);
    expect(receiptText(unknown, null).body).not.toMatch(/sent/i);
  });
});
