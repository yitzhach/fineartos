import { describe, expect, it } from 'vitest';
import { createPhoto, editPhoto, type Photo } from '../../photo/photo';
import { filterCounts, matchesFilter, pickedPhotos, picksFor } from '../picker';

const photo = (title: string, changes: Partial<Photo> = {}): Photo =>
  editPhoto(createPhoto({ imageId: `img-${title}`, title, pixelWidth: 100, pixelHeight: 100 }), changes);

const hung = photo('Hung', { inCurrentShow: true });
const forSale = photo('For sale', { status: 'available' });
const quiet = photo('Quiet');
const hiddenHung = photo('Hidden', { inCurrentShow: true, hiddenFromVisitors: true });
const all = [hung, forSale, quiet, hiddenHung];

describe('matchesFilter', () => {
  it('only counts what the artist actually marked', () => {
    expect(matchesFilter(hung, 'show')).toBe(true);
    expect(matchesFilter(forSale, 'show')).toBe(false);
    expect(matchesFilter(forSale, 'available')).toBe(true);
    // Nothing was said about this one, so it is neither in the show nor for sale.
    expect(matchesFilter(quiet, 'available')).toBe(false);
    expect(matchesFilter(quiet, 'all')).toBe(true);
  });
});

describe('picksFor', () => {
  it('hides a hidden picture from the visitor', () => {
    const shown = picksFor(all, 'show', { guestMode: true });
    expect(shown.map((p) => p.title)).toEqual(['Hung']);
  });

  it('keeps it in the studio view so it can be put back', () => {
    const shown = picksFor(all, 'show', { guestMode: false });
    expect(shown.map((p) => p.title)).toEqual(['Hung', 'Hidden']);
  });

  it('shows a picture that was never hidden either way', () => {
    // Records written before hiding existed have no flag at all.
    const older = { ...quiet } as Partial<Photo>;
    delete older.hiddenFromVisitors;
    expect(picksFor([older as Photo], 'all', { guestMode: true })).toHaveLength(1);
  });

  it('lets a filter be empty rather than falling back to everything', () => {
    expect(picksFor([quiet], 'show', { guestMode: false })).toEqual([]);
  });
});

describe('filterCounts', () => {
  it('counts what the chip will actually show', () => {
    expect(filterCounts(all, { guestMode: false })).toEqual({ show: 2, available: 1, all: 4 });
    expect(filterCounts(all, { guestMode: true })).toEqual({ show: 1, available: 1, all: 3 });
  });
});

describe('pickedPhotos', () => {
  it('keeps the order they were picked in', () => {
    const picked = pickedPhotos(all, [quiet.id, hung.id]);
    expect(picked.map((p) => p.title)).toEqual(['Quiet', 'Hung']);
  });

  it('drops a picture that has since been deleted', () => {
    expect(pickedPhotos(all, ['gone', hung.id]).map((p) => p.title)).toEqual(['Hung']);
  });
});
