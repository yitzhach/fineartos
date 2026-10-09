/**
 * The Visualizer's rules between the maths and the window, DOM-free: how the
 * artist's marks become a wall, where a piece starts, how a drag moves it, and
 * the one transform that draws it.
 *
 * Two ways to give the photo a scale. A known length (two points and a real
 * length) gives a flat wall: no perspective, the piece square to the camera.
 * Four wall corners and the wall's real width and height give a wall at an
 * angle, and the piece follows it. Either way the result is the same kind of
 * thing — a transform from wall inches to photo pixels — so placing, dragging
 * and drawing never need to know which one the artist used.
 */

import { apply, photoToWall, pixelsPerInch, wallToPhoto, type Homography, type Point } from './geometry';

export type Marks =
  | { mode: 'length'; points: Point[]; inches: number | null }
  | { mode: 'corners'; points: Point[]; widthIn: number | null; heightIn: number | null };

/** How many taps each way needs. */
export function pointsNeeded(mode: Marks['mode']): number {
  return mode === 'length' ? 2 : 4;
}

export interface Wall {
  /** Wall inches → photo pixels. */
  toPhoto: Homography;
  /** Photo pixels → wall inches. */
  toWall: Homography;
  /** The wall's extent in inches, when the artist gave one. A known length has none. */
  bounds: { w: number; h: number } | null;
}

/**
 * The wall from the marks, or what is still missing in words. Never a guessed
 * scale: until every point is down and every length is given, there is no wall.
 */
export function wallFromMarks(marks: Marks): Wall | { missing: string } {
  const need = pointsNeeded(marks.mode);
  if (marks.points.length < need) {
    const left = need - marks.points.length;
    return {
      missing:
        marks.mode === 'length'
          ? `Tap ${left === 2 ? 'both ends' : 'the other end'} of something you know the length of.`
          : `Tap the wall's ${CORNER_NAMES.slice(marks.points.length).join(', ')} corner${left === 1 ? '' : 's'}.`,
    };
  }
  if (marks.mode === 'length') {
    const [a, b] = marks.points as [Point, Point];
    const ppi = pixelsPerInch(a, b, marks.inches);
    if (marks.inches === null || !(marks.inches > 0)) return { missing: 'Say how long the marked line really is.' };
    if (ppi === null) return { missing: 'The two marks are on top of each other. Move one.' };
    const toPhoto = flatWall(ppi);
    return { toPhoto, toWall: photoToWall(toPhoto)!, bounds: null };
  }
  if (marks.widthIn === null || !(marks.widthIn > 0) || marks.heightIn === null || !(marks.heightIn > 0)) {
    return { missing: "Say the wall's real width and height." };
  }
  const corners = marks.points.slice(0, 4) as [Point, Point, Point, Point];
  const toPhoto = wallToPhoto(corners, marks.widthIn, marks.heightIn);
  const toWall = toPhoto ? photoToWall(toPhoto) : null;
  if (!toPhoto || !toWall) return { missing: 'Three of the corners are in a line. Move one so the four make a wall.' };
  return { toPhoto, toWall, bounds: { w: marks.widthIn, h: marks.heightIn } };
}

export const CORNER_NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

export function isWall(w: Wall | { missing: string }): w is Wall {
  return 'toPhoto' in w;
}

/** A flat wall: so many photo pixels to the inch, both ways, from the photo's corner. */
export function flatWall(ppi: number): Homography {
  return [ppi, 0, 0, 0, ppi, 0, 0, 0, 1];
}

/**
 * Where a piece first goes, in wall inches: the middle of the marked wall, or
 * the middle of the photo when only a length was marked.
 */
export function startCentre(wall: Wall, photo: { w: number; h: number }): Point {
  if (wall.bounds) return { x: wall.bounds.w / 2, y: wall.bounds.h / 2 };
  return apply(wall.toWall, { x: photo.w / 2, y: photo.h / 2 });
}

/**
 * The centre after a drag from `from` to `to` (photo pixels), starting at
 * `start` (wall inches). On a marked wall the whole piece stays on it; a piece
 * bigger than the wall sits centred on it.
 */
export function dragCentre(
  wall: Wall,
  start: Point,
  from: Point,
  to: Point,
  piece: { w: number; h: number },
): Point {
  const a = apply(wall.toWall, from);
  const b = apply(wall.toWall, to);
  return clampToWall(wall, { x: start.x + b.x - a.x, y: start.y + b.y - a.y }, piece);
}

export function clampToWall(wall: Wall, c: Point, piece: { w: number; h: number }): Point {
  if (!wall.bounds) return c;
  const fit = (v: number, size: number, span: number) =>
    size >= span ? span / 2 : Math.max(size / 2, Math.min(span - size / 2, v));
  return { x: fit(c.x, piece.w, wall.bounds.w), y: fit(c.y, piece.h, wall.bounds.h) };
}

/**
 * The transform that draws the piece: an element `widthIn × heightIn × unit`
 * CSS pixels (unit = element pixels per inch, so the picture keeps its
 * detail), centred at `c` wall inches, onto a photo shown `scale` times its
 * pixel size. Ready for `cssMatrix3d` with `transform-origin: 0 0`.
 */
export function pieceTransform(
  wall: Wall,
  c: Point,
  piece: { w: number; h: number },
  unit: number,
  scale: number,
): Homography {
  const [a, b, tx, d, e, ty, g, h, i] = wall.toPhoto;
  // element px → wall inches: x / unit + (c.x − w/2)
  const ox = c.x - piece.w / 2, oy = c.y - piece.h / 2;
  const k = 1 / unit;
  // wall → photo, then photo → screen (scale)
  const m: number[] = [
    scale * a * k, scale * b * k, scale * (a * ox + b * oy + tx),
    scale * d * k, scale * e * k, scale * (d * ox + e * oy + ty),
    g * k, h * k, g * ox + h * oy + i,
  ];
  const s = m[8]!;
  return m.map((v) => v / s) as Homography;
}
