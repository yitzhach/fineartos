/**
 * Cropping and straightening.
 *
 * Every photograph of a painting is a little crooked and a little too wide:
 * the wall either side, the edge of a table, a horizon a degree off. This is
 * the arithmetic for fixing both, kept apart from the canvas so it can be
 * tested on numbers.
 *
 * The one idea worth understanding is what a crop box is measured against.
 * Straightening rotates the picture, and a rotated rectangle has blank
 * corners; the largest upright rectangle that still fits *inside* the rotated
 * picture is `insideRect`, and a crop box is a fraction of that rather than
 * of the whole rotated bounding box. So a crop can never include a corner of
 * nothing, at any angle, without a single check anywhere else — and at zero
 * degrees the inside rect is the picture itself, so a plain crop behaves
 * exactly as it looks.
 *
 * DOM-free, like the rest of the model layer.
 */

export interface Size {
  width: number;
  height: number;
}

/** A crop, as fractions of the straightened picture: 0…1 in both directions. */
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Framing {
  /** Degrees to straighten by. Positive turns the picture clockwise. */
  angle: number;
  crop: CropBox;
}

export const FULL_CROP: CropBox = { x: 0, y: 0, width: 1, height: 1 };

/** How far a picture can be straightened. Past this it is a composition. */
export const MAX_ANGLE = 15;

/** The smallest crop, as a fraction. Below this it is a pixel hunt. */
export const MIN_CROP = 0.05;

export function neutralFraming(): Framing {
  return { angle: 0, crop: { ...FULL_CROP } };
}

/** True when the picture would come out whole and upright. */
export function isFramed(framing: Framing): boolean {
  const { angle, crop } = framing;
  return (
    angle !== 0 ||
    crop.x !== 0 ||
    crop.y !== 0 ||
    Math.abs(crop.width - 1) > 1e-6 ||
    Math.abs(crop.height - 1) > 1e-6
  );
}

/** The box a rotated picture needs, corners included. */
export function rotatedBounds(size: Size, angle: number): Size {
  const radians = (Math.abs(angle) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    width: size.width * cos + size.height * sin,
    height: size.width * sin + size.height * cos,
  };
}

/**
 * The largest upright rectangle wholly inside the rotated picture, keeping
 * the picture's own proportions. The standard result: for a rotation of a
 * w×h rectangle, the inscribed rectangle of the same aspect scales by
 * 1 / (cos θ + (h/w or w/h) · sin θ), whichever side is the long one.
 */
export function insideRect(size: Size, angle: number): Size {
  const radians = (Math.abs(angle) * Math.PI) / 180;
  // Built rather than spread: callers pass anything with a width and a height,
  // and an <img> element's are on its prototype — spreading one gives {}.
  if (radians === 0) return { width: size.width, height: size.height };
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  const scale = short / (long * sin + short * cos);
  return { width: size.width * scale, height: size.height * scale };
}

/** Keeps a crop box inside the picture and above the smallest useful size. */
export function clampBox(box: CropBox): CropBox {
  const width = Math.min(1, Math.max(MIN_CROP, box.width));
  const height = Math.min(1, Math.max(MIN_CROP, box.height));
  return {
    width,
    height,
    x: Math.min(1 - width, Math.max(0, box.x)),
    y: Math.min(1 - height, Math.max(0, box.y)),
  };
}

/**
 * The same box at a given shape, as wide as it can be without leaving the
 * picture, and centred where it already was. `ratio` is width ÷ height in the
 * picture's own pixels, so it needs the picture's proportions to work in
 * fractions; null leaves the box alone.
 */
export function withAspect(box: CropBox, ratio: number | null, picture: Size): CropBox {
  if (ratio === null || ratio <= 0) return clampBox(box);
  // A fraction of the width is worth `picture.width` pixels and a fraction of
  // the height `picture.height`, so the shape in fractions is not the shape
  // in pixels.
  const target = (ratio * picture.height) / picture.width;

  let width = box.width;
  let height = width / target;
  if (height > 1) {
    height = 1;
    width = height * target;
  }
  if (width > 1) {
    width = 1;
    height = width / target;
  }
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  return clampBox({ x: centreX - width / 2, y: centreY - height / 2, width, height });
}

/** The rectangle to cut, in the rotated picture's own pixels. */
export function cropRect(
  source: Size,
  framing: Framing,
): { x: number; y: number; width: number; height: number } {
  const bounds = rotatedBounds(source, framing.angle);
  const inside = insideRect(source, framing.angle);
  const box = clampBox(framing.crop);
  return {
    x: (bounds.width - inside.width) / 2 + box.x * inside.width,
    y: (bounds.height - inside.height) / 2 + box.y * inside.height,
    width: box.width * inside.width,
    height: box.height * inside.height,
  };
}

/** What the finished picture measures, in whole pixels. */
export function outputSize(source: Size, framing: Framing): Size {
  const rect = cropRect(source, framing);
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/** What was done to the frame, in words, for the note on a saved copy. */
export function describeFraming(framing: Framing, source?: Size): string[] {
  const said: string[] = [];
  if (framing.angle !== 0) said.push(`Straightened ${framing.angle > 0 ? '+' : ''}${round(framing.angle)}°`);
  if (
    framing.crop.x !== 0 ||
    framing.crop.y !== 0 ||
    Math.abs(framing.crop.width - 1) > 1e-6 ||
    Math.abs(framing.crop.height - 1) > 1e-6
  ) {
    const size = source ? outputSize(source, framing) : null;
    said.push(size ? `Cropped to ${size.width} × ${size.height}` : 'Cropped');
  }
  return said;
}

/** The shapes offered in the editor. Null is free — drag it as you like. */
export const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'four-five', label: '4:5', ratio: 4 / 5 },
  { id: 'five-four', label: '5:4', ratio: 5 / 4 },
  { id: 'two-three', label: '2:3', ratio: 2 / 3 },
  { id: 'three-two', label: '3:2', ratio: 3 / 2 },
  { id: 'sixteen-nine', label: '16:9', ratio: 16 / 9 },
];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
