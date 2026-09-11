import { describe, expect, it } from 'vitest';
import {
  addWallpaper,
  describeSize,
  findWallpaper,
  fitWithin,
  MAX_WALLPAPER_EDGE,
  removeWallpaper,
  renameWallpaper,
  type CustomWallpaper,
} from '../wallpapers';

const make = (imageId: string, name = imageId): CustomWallpaper => ({
  imageId,
  name,
  addedAt: '2026-09-11T00:00:00.000Z',
  width: 2560,
  height: 1440,
});

describe('the library', () => {
  it('puts the newest first, because that is the one being looked for', () => {
    const library = addWallpaper(addWallpaper([], make('a')), make('b'));
    expect(library.map((w) => w.imageId)).toEqual(['b', 'a']);
  });

  it('replaces rather than duplicates when the same image is added twice', () => {
    const library = addWallpaper(addWallpaper([], make('a', 'Old')), make('a', 'New'));
    expect(library).toHaveLength(1);
    expect(library[0]?.name).toBe('New');
  });

  it('removes one and leaves the rest', () => {
    const library = addWallpaper(addWallpaper([], make('a')), make('b'));
    expect(removeWallpaper(library, 'a').map((w) => w.imageId)).toEqual(['b']);
  });

  it('is unchanged when removing something that is not there', () => {
    const library = addWallpaper([], make('a'));
    expect(removeWallpaper(library, 'nope')).toHaveLength(1);
  });

  it('renames without disturbing anything else', () => {
    const library = addWallpaper(addWallpaper([], make('a', 'A')), make('b', 'B'));
    const renamed = renameWallpaper(library, 'a', 'Studio wall');
    expect(findWallpaper(renamed, 'a')?.name).toBe('Studio wall');
    expect(findWallpaper(renamed, 'b')?.name).toBe('B');
  });

  it('finds nothing for a null id rather than throwing', () => {
    expect(findWallpaper([make('a')], null)).toBeNull();
  });
});

describe('fitWithin', () => {
  it('leaves a picture that is already small enough alone', () => {
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900, resized: false });
  });

  it('never enlarges a small picture', () => {
    expect(fitWithin(400, 300).resized).toBe(false);
  });

  it('shrinks a phone photo to the longest edge and keeps the ratio', () => {
    const fitted = fitWithin(4032, 3024);
    expect(fitted.width).toBe(MAX_WALLPAPER_EDGE);
    expect(fitted.height).toBe(1920);
    expect(fitted.resized).toBe(true);
  });

  it('handles a portrait photo by its longest edge, not its width', () => {
    const fitted = fitWithin(3024, 4032);
    expect(fitted.height).toBe(MAX_WALLPAPER_EDGE);
    expect(fitted.width).toBe(1920);
  });

  it('never rounds an edge down to zero', () => {
    expect(fitWithin(10000, 3, 100).height).toBeGreaterThanOrEqual(1);
  });

  it('refuses to do arithmetic on a zero dimension', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0, resized: false });
  });
});

describe('describeSize', () => {
  it('reads as a size', () => {
    expect(describeSize(2560, 1440)).toBe('2560 × 1440');
  });
});
