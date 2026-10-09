import { describe, expect, it } from 'vitest';
import { apply, type Point } from '../geometry';
import { clampToWall, dragCentre, isWall, pieceTransform, startCentre, wallFromMarks, type Wall } from '../placement';

const near = (p: Point, q: Point) => {
  expect(p.x).toBeCloseTo(q.x, 6);
  expect(p.y).toBeCloseTo(q.y, 6);
};

const flat = (): Wall => {
  const w = wallFromMarks({ mode: 'length', points: [{ x: 0, y: 0 }, { x: 300, y: 400 }], inches: 50 });
  if (!isWall(w)) throw new Error(w.missing);
  return w;
};

const corners: Point[] = [{ x: 100, y: 50 }, { x: 500, y: 120 }, { x: 480, y: 400 }, { x: 120, y: 450 }];
const slanted = (): Wall => {
  const w = wallFromMarks({ mode: 'corners', points: corners, widthIn: 120, heightIn: 96 });
  if (!isWall(w)) throw new Error(w.missing);
  return w;
};

describe('marks to a wall', () => {
  it('asks for what is missing, never guesses', () => {
    expect(wallFromMarks({ mode: 'length', points: [], inches: 10 })).toEqual({
      missing: 'Tap both ends of something you know the length of.',
    });
    expect(wallFromMarks({ mode: 'length', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], inches: null })).toHaveProperty('missing');
    expect(wallFromMarks({ mode: 'corners', points: corners.slice(0, 1), widthIn: 1, heightIn: 1 })).toEqual({
      missing: "Tap the wall's top-right, bottom-right, bottom-left corners.",
    });
    expect(wallFromMarks({ mode: 'corners', points: corners, widthIn: 120, heightIn: null })).toHaveProperty('missing');
  });
  it('refuses marks on top of each other or corners in a line', () => {
    expect(wallFromMarks({ mode: 'length', points: [{ x: 5, y: 5 }, { x: 5, y: 5 }], inches: 10 })).toHaveProperty('missing');
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
    expect(wallFromMarks({ mode: 'corners', points: line, widthIn: 10, heightIn: 10 })).toHaveProperty('missing');
  });
  it('a known length is a flat wall at that scale', () => {
    near(apply(flat().toPhoto, { x: 5, y: 2 }), { x: 50, y: 20 });
    expect(flat().bounds).toBeNull();
  });
  it('four corners map the wall rectangle onto them', () => {
    const w = slanted();
    near(apply(w.toPhoto, { x: 120, y: 96 }), corners[2]!);
    expect(w.bounds).toEqual({ w: 120, h: 96 });
  });
});

describe('placing and dragging', () => {
  it('starts in the middle of the wall, or of the photo', () => {
    expect(startCentre(slanted(), { w: 600, h: 500 })).toEqual({ x: 60, y: 48 });
    near(startCentre(flat(), { w: 600, h: 500 }), { x: 30, y: 25 });
  });
  it('a drag moves the piece by the same wall distance under the finger', () => {
    near(dragCentre(flat(), { x: 30, y: 25 }, { x: 100, y: 100 }, { x: 150, y: 80 }, { w: 10, h: 10 }), { x: 35, y: 23 });
  });
  it('keeps the whole piece on a marked wall', () => {
    const w = slanted();
    expect(clampToWall(w, { x: 0, y: 200 }, { w: 24, h: 36 })).toEqual({ x: 12, y: 78 });
    expect(clampToWall(w, { x: 10, y: 10 }, { w: 200, h: 36 })).toEqual({ x: 60, y: 18 });
    expect(clampToWall(flat(), { x: -5, y: 900 }, { w: 24, h: 36 })).toEqual({ x: -5, y: 900 });
  });
});

describe('drawing', () => {
  it("puts the element's corners on the piece's corners, at the display scale", () => {
    const w = slanted();
    const piece = { w: 24, h: 36 };
    const c = { x: 40, y: 30 };
    const unit = 10, scale = 0.5;
    const m = pieceTransform(w, c, piece, unit, scale);
    const photoTL = apply(w.toPhoto, { x: 28, y: 12 });
    const photoBR = apply(w.toPhoto, { x: 52, y: 48 });
    near(apply(m, { x: 0, y: 0 }), { x: photoTL.x * scale, y: photoTL.y * scale });
    near(apply(m, { x: 240, y: 360 }), { x: photoBR.x * scale, y: photoBR.y * scale });
  });
});
