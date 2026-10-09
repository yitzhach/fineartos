import { describe, expect, it } from 'vitest';
import { apply, pieceQuad, pieceSizePx, photoToWall, pixelsPerInch, squareToQuad, wallToPhoto, type Point } from '../geometry';

const near = (p: Point, q: Point) => {
  expect(p.x).toBeCloseTo(q.x, 6);
  expect(p.y).toBeCloseTo(q.y, 6);
};

describe('scale', () => {
  it('reads pixels per inch off a marked line', () => {
    expect(pixelsPerInch({ x: 0, y: 0 }, { x: 300, y: 400 }, 50)).toBe(10);
  });
  it('stays unknown without a real length or a line', () => {
    expect(pixelsPerInch({ x: 0, y: 0 }, { x: 10, y: 0 }, null)).toBeNull();
    expect(pixelsPerInch({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBeNull();
    expect(pixelsPerInch({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toBeNull();
  });
  it('sizes the piece at true size, never a guessed one', () => {
    expect(pieceSizePx(24, 36, 10)).toEqual({ w: 240, h: 360 });
    expect(pieceSizePx(null, 36, 10)).toBeNull();
    expect(pieceSizePx(24, 36, null)).toBeNull();
  });
});

describe('perspective', () => {
  const quad: [Point, Point, Point, Point] = [
    { x: 100, y: 50 }, { x: 500, y: 120 }, { x: 480, y: 400 }, { x: 120, y: 450 },
  ];
  it('maps the unit square onto the four corners', () => {
    const m = squareToQuad(quad)!;
    near(apply(m, { x: 0, y: 0 }), quad[0]);
    near(apply(m, { x: 1, y: 0 }), quad[1]);
    near(apply(m, { x: 1, y: 1 }), quad[2]);
    near(apply(m, { x: 0, y: 1 }), quad[3]);
  });
  it('refuses corners in a line', () => {
    expect(squareToQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])).toBeNull();
  });
  it('places wall inches on the photo and back again', () => {
    const m = wallToPhoto(quad, 120, 96)!;
    near(apply(m, { x: 120, y: 96 }), quad[2]);
    const back = photoToWall(m)!;
    near(apply(back, apply(m, { x: 40, y: 30 })), { x: 40, y: 30 });
  });
  it('a flat, square-on wall keeps the piece at plain scale', () => {
    const flat: [Point, Point, Point, Point] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }, { x: 0, y: 800 }];
    const m = wallToPhoto(flat, 100, 80)!;
    const q = pieceQuad(m, 50, 40, 20, 10)!;
    near(q[0], { x: 400, y: 350 });
    near(q[2], { x: 600, y: 450 });
  });
  it('no size, no piece', () => {
    const m = wallToPhoto(quad, 120, 96)!;
    expect(pieceQuad(m, 60, 48, null, 10)).toBeNull();
  });
});
