import { describe, expect, it } from 'vitest';
import {
  ASPECTS,
  MIN_CROP,
  clampBox,
  cropRect,
  describeFraming,
  insideRect,
  isFramed,
  neutralFraming,
  outputSize,
  rotatedBounds,
  withAspect,
} from '../crop';

const landscape = { width: 4000, height: 3000 };

describe('neutral', () => {
  it('is the whole picture, upright', () => {
    const framing = neutralFraming();
    expect(isFramed(framing)).toBe(false);
    expect(outputSize(landscape, framing)).toEqual(landscape);
  });

  it('knows when something has been done to it', () => {
    expect(isFramed({ ...neutralFraming(), angle: 1 })).toBe(true);
    expect(isFramed({ angle: 0, crop: { x: 0, y: 0, width: 0.5, height: 1 } })).toBe(true);
  });
});

describe('straightening', () => {
  it('needs a bigger box to hold a rotated picture', () => {
    const bounds = rotatedBounds(landscape, 10);
    expect(bounds.width).toBeGreaterThan(landscape.width);
    expect(bounds.height).toBeGreaterThan(landscape.height);
  });

  it('turns the same amount either way', () => {
    expect(rotatedBounds(landscape, 7)).toEqual(rotatedBounds(landscape, -7));
    expect(insideRect(landscape, 7)).toEqual(insideRect(landscape, -7));
  });

  it('leaves the picture alone at zero', () => {
    expect(insideRect(landscape, 0)).toEqual(landscape);
    expect(rotatedBounds(landscape, 0)).toEqual(landscape);
  });

  it('gives back a smaller picture the more it is straightened', () => {
    const gentle = insideRect(landscape, 2).width;
    const heavy = insideRect(landscape, 12).width;
    expect(gentle).toBeLessThan(landscape.width);
    expect(heavy).toBeLessThan(gentle);
  });

  it('keeps the picture\'s own proportions', () => {
    const inside = insideRect(landscape, 9);
    expect(inside.width / inside.height).toBeCloseTo(landscape.width / landscape.height, 6);
  });

  it('never hands back a corner of nothing', () => {
    // Every corner of the inside rect must sit within the rotated picture.
    for (const angle of [1, 5, 12, -8]) {
      const inside = insideRect(landscape, angle);
      const radians = (Math.abs(angle) * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      // Rotating a corner back into the picture's own frame must land inside it.
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const x = (dx * inside.width) / 2;
        const y = (dy * inside.height) / 2;
        const back = { x: x * cos + y * sin, y: -x * sin + y * cos };
        expect(Math.abs(back.x)).toBeLessThanOrEqual(landscape.width / 2 + 1e-6);
        expect(Math.abs(back.y)).toBeLessThanOrEqual(landscape.height / 2 + 1e-6);
      }
    }
  });
});

describe('the crop box', () => {
  it('is held inside the picture', () => {
    expect(clampBox({ x: -0.4, y: 0.9, width: 0.5, height: 0.5 })).toEqual({
      x: 0,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
  });

  it('is never smaller than a crop worth having', () => {
    const tiny = clampBox({ x: 0.5, y: 0.5, width: 0.001, height: 0.001 });
    expect(tiny.width).toBe(MIN_CROP);
    expect(tiny.height).toBe(MIN_CROP);
  });

  it('cuts the right rectangle out of the middle', () => {
    const rect = cropRect(landscape, {
      angle: 0,
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    });
    expect(rect).toEqual({ x: 1000, y: 750, width: 2000, height: 1500 });
  });

  it('measures a crop against the straightened picture, not the box around it', () => {
    const framing = { angle: 8, crop: { x: 0, y: 0, width: 1, height: 1 } };
    const rect = cropRect(landscape, framing);
    const inside = insideRect(landscape, 8);
    const bounds = rotatedBounds(landscape, 8);
    expect(rect.width).toBeCloseTo(inside.width, 6);
    // Centred in the rotated box, so the blank corners are left behind.
    expect(rect.x).toBeCloseTo((bounds.width - inside.width) / 2, 6);
  });

  it('reports the finished size in whole pixels', () => {
    const size = outputSize(landscape, { angle: 0, crop: { x: 0, y: 0, width: 0.5, height: 0.3 } });
    expect(size).toEqual({ width: 2000, height: 900 });
  });
});

describe('shapes', () => {
  const square = ASPECTS.find((a) => a.id === 'square')!.ratio!;

  it('makes a square that really is square in pixels', () => {
    const box = withAspect({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, square, landscape);
    const size = outputSize(landscape, { angle: 0, crop: box });
    expect(size.width).toBe(size.height);
  });

  it('keeps the box where it was', () => {
    const box = withAspect({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, square, landscape);
    expect(box.x + box.width / 2).toBeCloseTo(0.5, 6);
    expect(box.y + box.height / 2).toBeCloseTo(0.5, 6);
  });

  it('never leaves the picture, whatever shape is asked for', () => {
    for (const aspect of ASPECTS) {
      const box = withAspect({ x: 0, y: 0, width: 1, height: 1 }, aspect.ratio, landscape);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1 + 1e-9);
      expect(box.y + box.height).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('leaves a free crop exactly as it is', () => {
    const box = { x: 0.1, y: 0.2, width: 0.5, height: 0.3 };
    expect(withAspect(box, null, landscape)).toEqual(box);
  });
});

describe('describeFraming', () => {
  it('says nothing about a picture that was left whole', () => {
    expect(describeFraming(neutralFraming(), landscape)).toEqual([]);
  });

  it('names the angle and the finished size', () => {
    const said = describeFraming(
      { angle: -2.5, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      landscape,
    );
    expect(said[0]).toBe('Straightened -2.5°');
    expect(said[1]).toMatch(/^Cropped to \d+ × \d+$/);
  });
});
