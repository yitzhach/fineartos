/**
 * The Visualizer's maths, DOM-free. A room photo, a length the artist marks on
 * it and says the real size of, and the piece placed at true size on the wall.
 *
 * Points are image pixels of the room photo. Sizes of the piece are inches,
 * as the picture record keeps them.
 */

export interface Point {
  x: number;
  y: number;
}

/** Pixels per inch from a marked line and its real length. Null when it cannot be known. */
export function pixelsPerInch(a: Point, b: Point, realInches: number | null): number | null {
  if (realInches === null || !Number.isFinite(realInches) || realInches <= 0) return null;
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (px < 1) return null;
  return px / realInches;
}

/** The piece's size in room-photo pixels, flat on the wall. Unknown size stays unknown. */
export function pieceSizePx(
  widthIn: number | null,
  heightIn: number | null,
  ppi: number | null,
): { w: number; h: number } | null {
  if (ppi === null || widthIn === null || heightIn === null) return null;
  if (widthIn <= 0 || heightIn <= 0) return null;
  return { w: widthIn * ppi, h: heightIn * ppi };
}

/** A 3x3 projective transform, row-major, h[8] = 1. */
export type Homography = [number, number, number, number, number, number, number, number, number];

/**
 * The transform taking the unit square's corners (0,0) (1,0) (1,1) (0,1) to
 * the four given points, in that order (top-left, top-right, bottom-right,
 * bottom-left). Null when the four points are degenerate (three in a line).
 */
export function squareToQuad(q: [Point, Point, Point, Point]): Homography | null {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

export function apply(m: Homography, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

function invert(m: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const r = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ].map((v) => v / det);
  const s = r[8]!;
  return r.map((v) => v / s) as Homography;
}

function multiply(m: Homography, n: Homography): Homography {
  const out: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += m[r * 3 + k]! * n[k * 3 + c]!;
      out.push(s);
    }
  const s = out[8]!;
  return out.map((v) => v / s) as Homography;
}

/**
 * The wall's four corners as marked on the photo, and that wall's real size in
 * inches: the transform from wall inches (x right, y down from the top-left
 * corner) to photo pixels. A piece placed in wall inches follows the wall's angle.
 */
export function wallToPhoto(
  corners: [Point, Point, Point, Point],
  wallWidthIn: number,
  wallHeightIn: number,
): Homography | null {
  if (!(wallWidthIn > 0) || !(wallHeightIn > 0)) return null;
  const sq = squareToQuad(corners);
  if (!sq) return null;
  const scale: Homography = [1 / wallWidthIn, 0, 0, 0, 1 / wallHeightIn, 0, 0, 0, 1];
  return multiply(sq, scale);
}

/** Photo pixels back to wall inches, for dragging the piece on a slanted wall. */
export function photoToWall(m: Homography): Homography | null {
  return invert(m);
}

/** CSS `matrix3d` for an element of size w×h px drawn through the transform `m` (element px → photo px). */
export function cssMatrix3d(m: Homography): string {
  const [a, b, c, d, e, f, g, h, i] = m;
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].join(',')})`;
}

/**
 * The piece's corners on the photo, centred at (cx, cy) wall inches. Null
 * while the piece's size is not known — never a guessed size.
 */
export function pieceQuad(
  m: Homography,
  cx: number,
  cy: number,
  widthIn: number | null,
  heightIn: number | null,
): [Point, Point, Point, Point] | null {
  if (widthIn === null || heightIn === null || widthIn <= 0 || heightIn <= 0) return null;
  const l = cx - widthIn / 2, r = cx + widthIn / 2, t = cy - heightIn / 2, b = cy + heightIn / 2;
  return [apply(m, { x: l, y: t }), apply(m, { x: r, y: t }), apply(m, { x: r, y: b }), apply(m, { x: l, y: b })];
}
