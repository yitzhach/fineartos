import { describe, expect, it } from 'vitest';
import { averageRgb, cssFilter, matchLighting, warmth } from '../lighting';

describe('lighting', () => {
  it('a bright neutral wall leaves the piece alone', () => {
    const l = matchLighting({ r: 204, g: 204, b: 204 });
    expect(l.brightness).toBeCloseTo(1, 2);
    expect(l.sepia).toBe(0);
    expect(l.hue).toBe(0);
  });
  it('a dim room darkens the piece, within limits', () => {
    expect(matchLighting({ r: 60, g: 60, b: 60 }).brightness).toBeLessThan(0.5);
    expect(matchLighting({ r: 0, g: 0, b: 0 }).brightness).toBe(0.4);
  });
  it('a warm room warms it; a cool room cools it', () => {
    expect(matchLighting({ r: 220, g: 180, b: 120 }).sepia).toBeGreaterThan(0);
    expect(matchLighting({ r: 140, g: 170, b: 220 }).hue).toBeLessThan(0);
    expect(warmth({ r: 0, g: 0, b: 0 })).toBe(0);
  });
  it('strength 0 is no change', () => {
    expect(cssFilter(matchLighting({ r: 220, g: 150, b: 60 }, 0))).toBe('brightness(1.000)');
  });
  it('no sample, no adjustment', () => {
    expect(matchLighting(null).brightness).toBe(1);
  });
  it('averages pixels, skipping transparent ones', () => {
    expect(averageRgb([10, 20, 30, 255, 30, 40, 50, 255, 255, 255, 255, 0])).toEqual({ r: 20, g: 30, b: 40 });
    expect(averageRgb([1, 2, 3, 0])).toBeNull();
  });
});
