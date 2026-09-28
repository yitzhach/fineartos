import { describe, expect, it } from 'vitest';
import {
  boothPanels,
  boothPieces,
  boothPriceLine,
  defaultBooth,
  isIdle,
  lockoutSeconds,
  parseBooth,
  pinMatches,
  pinProblem,
  slideAt,
  startProblem,
  withPin,
} from '../booth';
import { createPhoto, type Photo } from '../../photo/photo';

const photo = (id: string, changes: Partial<Photo> = {}): Photo => ({
  ...createPhoto({ imageId: `img-${id}`, title: id, pixelWidth: 10, pixelHeight: 10 }),
  id,
  ...changes,
});

describe('booth PIN', () => {
  it('refuses weak or mismatched PINs', () => {
    expect(pinProblem('12a4', '12a4')).toMatch(/digits only/);
    expect(pinProblem('123', '123')).toMatch(/four/);
    expect(pinProblem('0000', '0000')).toMatch(/repeated/);
    expect(pinProblem('4821', '4812')).toMatch(/match/);
    expect(pinProblem('4821', '4821')).toBeNull();
  });

  it('keeps a hash, never the PIN, and checks it', async () => {
    const settings = await withPin(defaultBooth(), '4821', 'salt');
    expect(JSON.stringify(settings)).not.toContain('4821');
    expect(await pinMatches(settings, '4821')).toBe(true);
    expect(await pinMatches(settings, '4812')).toBe(false);
    expect(await pinMatches(defaultBooth(), '4821')).toBe(false);
  });

  it('cannot start without a PIN', async () => {
    expect(startProblem(defaultBooth())).toMatch(/PIN/);
    expect(startProblem(await withPin(defaultBooth(), '4821'))).toBeNull();
  });

  it('slows wrong guesses down', () => {
    expect(lockoutSeconds(2)).toBe(0);
    expect(lockoutSeconds(3)).toBe(5);
    expect(lockoutSeconds(4)).toBe(10);
    expect(lockoutSeconds(40)).toBe(300);
  });
});

describe('booth settings', () => {
  it('parses junk to defaults and clamps timings', () => {
    expect(parseBooth(null)).toEqual(defaultBooth());
    const parsed = parseBooth({ pinHash: 'h', idleSeconds: 1, slideSeconds: 999, siteShowsInside: 'yes' });
    expect(parsed.pinHash).toBeNull(); // hash without salt is useless
    expect(parsed.idleSeconds).toBe(20);
    expect(parsed.slideSeconds).toBe(60);
    expect(parsed.siteShowsInside).toBe(false);
  });
});

describe('booth panels', () => {
  it('shows the website only once the artist saw it inside', () => {
    const base = defaultBooth();
    expect(boothPanels(base, 'https://a.art')).toEqual(['guestbook', 'pieces', 'qr']);
    expect(boothPanels({ ...base, siteShowsInside: true }, 'https://a.art')).toContain('website');
    expect(boothPanels({ ...base, siteShowsInside: true }, null)).not.toContain('website');
    expect(boothPanels({ ...base, statement: '  ' }, null)).not.toContain('statement');
    expect(boothPanels({ ...base, statement: 'I paint rivers.' }, null)).toContain('statement');
  });
});

describe('booth pieces', () => {
  it('takes show pieces and hanging pieces, never hidden ones', () => {
    const photos = [
      photo('a'),
      photo('b', { inCurrentShow: true }),
      photo('c', { hiddenFromVisitors: true, inCurrentShow: true }),
      photo('d'),
    ];
    expect(boothPieces(photos, ['a', 'c']).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('never prices an unpriced piece at zero', () => {
    expect(boothPriceLine(photo('a'))).toBe('Price on request');
    expect(boothPriceLine(photo('a', { price: 1200, currency: 'USD' }))).toBe('$1,200');
    expect(boothPriceLine(photo('a', { price: 1200, status: 'sold' }))).toBe('Sold');
    expect(boothPriceLine(photo('a', { status: 'nfs' }))).toBe('Not for sale');
  });
});

describe('attract loop timing', () => {
  it('goes idle after the set seconds', () => {
    expect(isIdle(0, 59_999, 60)).toBe(false);
    expect(isIdle(0, 60_000, 60)).toBe(true);
  });

  it('steps through slides and wraps', () => {
    expect(slideAt(0, 0, 10_000, 5)).toBe(-1);
    expect(slideAt(3, 0, 4_999, 5)).toBe(0);
    expect(slideAt(3, 0, 5_000, 5)).toBe(1);
    expect(slideAt(3, 0, 15_000, 5)).toBe(0);
  });
});
