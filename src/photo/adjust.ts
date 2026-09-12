/**
 * Darkroom arithmetic: what an adjustment does to a pixel.
 *
 * Every control in the editor is a number here, and every number is applied
 * by `applyAdjustments`. No canvas, no DOM — the editor hands it the pixels
 * it got from a canvas and draws whatever comes back, which is what lets the
 * whole pipeline be tested on three-pixel images.
 *
 * Two things worth knowing before changing anything:
 *
 *  - **Nothing here touches the original.** An adjustment is a set of numbers
 *    kept beside the picture; the stored image is never written over. Saving
 *    an edit makes a new picture, so a bad crop or a heavy hand is never the
 *    end of the original photograph.
 *  - **Order matters.** Exposure and levels work on the raw channels,
 *    contrast and the tone controls on the result, and everything to do with
 *    colour happens last in HSL, so shifting the yellows works on the picture
 *    the artist can actually see rather than on some earlier version of it.
 *
 * The colour bands are the useful part: "take the yellows to red" means
 * picking out the pixels whose hue is near yellow and rotating those, leaving
 * everything else alone. Two details make that look like a photograph instead
 * of a poster: the bands overlap with a soft falloff, so there is no hard
 * edge where a hue stops being yellow, and the effect is scaled by how
 * colourful a pixel already is, so greys and near-whites are left where they
 * are rather than being tinted.
 */

/** The eight hues the editor lets the artist work on, as Lightroom does. */
export type BandName =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'magenta';

export const BAND_NAMES: BandName[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'magenta',
];

/** Where each band sits on the colour wheel, in degrees. */
export const BAND_HUES: Record<BandName, number> = {
  red: 0,
  orange: 30,
  yellow: 55,
  green: 120,
  cyan: 180,
  blue: 225,
  purple: 275,
  magenta: 320,
};

export interface BandAdjustment {
  /** Degrees to rotate this band's hue: −180…180. 60 takes yellow to green. */
  hue: number;
  /** −100 drains this band to grey, 100 doubles what colour it has. */
  saturation: number;
  /** −100…100, lighter or darker without touching anything else. */
  luminance: number;
}

export interface Adjustments {
  /** −100…100. Overall brightness, applied before anything else. */
  exposure: number;
  /** −100…100 around the midpoint. */
  contrast: number;
  /** −100…100. Pulls the bright end down, or pushes it up. */
  highlights: number;
  /** −100…100. Opens the dark end, or closes it. */
  shadows: number;
  /** 0…100. The levels black point: everything under it becomes black. */
  blackPoint: number;
  /** 0…100. The levels white point, as a distance down from white. */
  whitePoint: number;
  /** The levels midtone. 1 is untouched; under 1 darker, over 1 lighter. */
  gamma: number;
  /** −100…100. Warmer pushes red and drops blue; cooler does the reverse. */
  temperature: number;
  /** −100…100 across the whole picture. */
  saturation: number;
  /** −180…180 across the whole picture. */
  hue: number;
  /** Converts to grey last, so the band controls become a channel mixer. */
  blackAndWhite: boolean;
  bands: Record<BandName, BandAdjustment>;
}

export function neutralBand(): BandAdjustment {
  return { hue: 0, saturation: 0, luminance: 0 };
}

export function neutralAdjustments(): Adjustments {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    blackPoint: 0,
    whitePoint: 0,
    gamma: 1,
    temperature: 0,
    saturation: 0,
    hue: 0,
    blackAndWhite: false,
    bands: Object.fromEntries(BAND_NAMES.map((name) => [name, neutralBand()])) as Record<
      BandName,
      BandAdjustment
    >,
  };
}

/** True when the picture would come out exactly as it went in. */
export function isNeutral(adjustments: Adjustments): boolean {
  const a = adjustments;
  if (a.blackAndWhite) return false;
  if (
    a.exposure !== 0 ||
    a.contrast !== 0 ||
    a.highlights !== 0 ||
    a.shadows !== 0 ||
    a.blackPoint !== 0 ||
    a.whitePoint !== 0 ||
    a.gamma !== 1 ||
    a.temperature !== 0 ||
    a.saturation !== 0 ||
    a.hue !== 0
  ) {
    return false;
  }
  return BAND_NAMES.every((name) => {
    const band = a.bands[name];
    return band.hue === 0 && band.saturation === 0 && band.luminance === 0;
  });
}

/** What was changed, in words. Used on the saved copy, so it says why it differs. */
export function describeAdjustments(adjustments: Adjustments): string[] {
  const a = adjustments;
  const said: string[] = [];
  const named: [string, number][] = [
    ['Exposure', a.exposure],
    ['Contrast', a.contrast],
    ['Highlights', a.highlights],
    ['Shadows', a.shadows],
    ['Black point', a.blackPoint],
    ['White point', a.whitePoint],
    ['Temperature', a.temperature],
    ['Saturation', a.saturation],
    ['Hue', a.hue],
  ];
  for (const [label, value] of named) {
    if (value !== 0) said.push(`${label} ${value > 0 ? '+' : ''}${round(value)}`);
  }
  if (a.gamma !== 1) said.push(`Midtones ${round(a.gamma)}`);
  if (a.blackAndWhite) said.push('Black and white');
  for (const name of BAND_NAMES) {
    const band = a.bands[name];
    const parts: string[] = [];
    if (band.hue !== 0) parts.push(`hue ${band.hue > 0 ? '+' : ''}${round(band.hue)}`);
    if (band.saturation !== 0)
      parts.push(`saturation ${band.saturation > 0 ? '+' : ''}${round(band.saturation)}`);
    if (band.luminance !== 0)
      parts.push(`luminance ${band.luminance > 0 ? '+' : ''}${round(band.luminance)}`);
    if (parts.length > 0) said.push(`${name} (${parts.join(', ')})`);
  }
  return said;
}

/**
 * Runs the pipeline over RGBA pixels, as they come out of a canvas.
 *
 * Returns a new array by default so the source can be kept and re-applied
 * with different numbers — which is how the editor stays live without
 * re-decoding the picture. Pass the source as the target to work in place.
 * Alpha is carried through untouched: an adjustment is not a mask.
 */
export function applyAdjustments(
  source: Uint8ClampedArray,
  adjustments: Adjustments,
  target: Uint8ClampedArray = new Uint8ClampedArray(source.length),
): Uint8ClampedArray {
  const a = adjustments;
  const exposure = 1 + a.exposure / 100;
  const contrast = 1 + a.contrast / 100;
  const warm = a.temperature / 100;
  const black = a.blackPoint / 100;
  const white = 1 - a.whitePoint / 100;
  const gamma = a.gamma > 0 ? a.gamma : 1;
  const range = Math.max(0.001, white - black);
  const saturation = 1 + a.saturation / 100;
  const bandsUsed = BAND_NAMES.filter((name) => {
    const band = a.bands[name];
    return band.hue !== 0 || band.saturation !== 0 || band.luminance !== 0;
  });

  for (let i = 0; i < source.length; i += 4) {
    let r = source[i]! / 255;
    let g = source[i + 1]! / 255;
    let b = source[i + 2]! / 255;

    if (exposure !== 1) {
      r *= exposure;
      g *= exposure;
      b *= exposure;
    }

    if (warm !== 0) {
      // A crude but readable white balance: warm lifts red and drops blue.
      r += warm * 0.12;
      b -= warm * 0.12;
    }

    if (black !== 0 || white !== 1) {
      r = (r - black) / range;
      g = (g - black) / range;
      b = (b - black) / range;
    }

    if (gamma !== 1) {
      r = powClamped(r, 1 / gamma);
      g = powClamped(g, 1 / gamma);
      b = powClamped(b, 1 / gamma);
    }

    if (contrast !== 1) {
      r = (r - 0.5) * contrast + 0.5;
      g = (g - 0.5) * contrast + 0.5;
      b = (b - 0.5) * contrast + 0.5;
    }

    if (a.highlights !== 0 || a.shadows !== 0) {
      const level = clamp01(0.299 * r + 0.587 * g + 0.114 * b);
      // Weighted so the middle of the range is barely touched by either.
      const high = level * level;
      const low = (1 - level) * (1 - level);
      const lift = (a.highlights / 100) * high * 0.5 + (a.shadows / 100) * low * 0.5;
      r += lift;
      g += lift;
      b += lift;
    }

    r = clamp01(r);
    g = clamp01(g);
    b = clamp01(b);

    const colourWork = saturation !== 1 || a.hue !== 0 || bandsUsed.length > 0;
    if (colourWork) {
      let [h, s, l] = rgbToHsl(r, g, b);

      if (bandsUsed.length > 0 && s > 0) {
        let hueShift = 0;
        let satShift = 0;
        let lumShift = 0;
        for (const name of bandsUsed) {
          // Scaled by how colourful the pixel is: a near-grey has a hue, but
          // it is not meaningfully "a yellow", and tinting it looks wrong.
          const weight = bandWeight(h, name) * Math.min(1, s * 2);
          if (weight === 0) continue;
          const band = a.bands[name];
          hueShift += weight * band.hue;
          satShift += weight * (band.saturation / 100);
          lumShift += weight * (band.luminance / 100);
        }
        h = wrapHue(h + hueShift);
        s = clamp01(satShift >= 0 ? s + (1 - s) * satShift : s * (1 + satShift));
        l = clamp01(lumShift >= 0 ? l + (1 - l) * lumShift : l * (1 + lumShift));
      }

      if (a.hue !== 0) h = wrapHue(h + a.hue);
      if (saturation !== 1) s = clamp01(s * saturation);

      [r, g, b] = hslToRgb(h, s, l);
    }

    if (a.blackAndWhite) {
      // Last, so the band controls above have worked as a channel mixer:
      // dropping the blues before this is what darkens a sky in a print.
      const grey = clamp01(0.299 * r + 0.587 * g + 0.114 * b);
      r = grey;
      g = grey;
      b = grey;
    }

    target[i] = Math.round(r * 255);
    target[i + 1] = Math.round(g * 255);
    target[i + 2] = Math.round(b * 255);
    target[i + 3] = source[i + 3]!;
  }

  return target;
}

/**
 * How much a hue belongs to a band: 1 at its centre, easing to 0 at the
 * neighbouring band's centre. Raised cosine rather than a step, because a
 * hard edge shows as a seam across a gradient — a sky is the obvious one.
 */
export function bandWeight(hue: number, name: BandName): number {
  const offset = wrapSigned(hue - BAND_HUES[name]);
  // Each side reaches its own neighbour, because the bands are not evenly
  // spaced: yellow is 25° from orange and 65° from green, and a single span
  // would either leave a gap on one side or swallow the neighbour on the
  // other.
  const span = spanTowards(name, offset >= 0 ? 1 : -1);
  const distance = Math.abs(offset);
  if (distance >= span) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * distance) / span));
}

/** How far the band reaches one way round the wheel: to the next centre. */
function spanTowards(name: BandName, direction: 1 | -1): number {
  const centre = BAND_HUES[name];
  let nearest = 360;
  for (const other of BAND_NAMES) {
    if (other === name) continue;
    const offset = wrapSigned(BAND_HUES[other] - centre);
    if (offset === 0 || Math.sign(offset) !== direction) continue;
    nearest = Math.min(nearest, Math.abs(offset));
  }
  return nearest;
}

/** Hue in degrees 0…360, saturation and lightness 0…1. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = wrapHue(h) / 360;
  return [
    hueToChannel(p, q, hue + 1 / 3),
    hueToChannel(p, q, hue),
    hueToChannel(p, q, hue - 1 / 3),
  ];
}

function hueToChannel(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

export function wrapHue(hue: number): number {
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** The shortest way round the wheel: −180…180. */
function wrapSigned(degrees: number): number {
  const wrapped = wrapHue(degrees);
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function powClamped(value: number, exponent: number): number {
  return Math.pow(clamp01(value), exponent);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
