/**
 * Matching the piece to the room: brightness and warmth sampled from the wall
 * around it, turned into a CSS filter and a soft shadow. DOM-free; the caller
 * hands in averaged RGB (0–255).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Rec. 709 luma, 0–1. */
export function luma({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Warmth from −1 (blue) to 1 (amber): red against blue, normalised by brightness. */
export function warmth({ r, b }: Rgb): number {
  const sum = r + b;
  if (sum <= 0) return 0;
  return Math.max(-1, Math.min(1, (r - b) / sum));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Lighting {
  /** Multiplier for the piece's brightness, 0.4–1.15. A well-lit white wall (~0.8 luma) leaves it at 1. */
  brightness: number;
  /** Sepia amount 0–0.35 for a warm room; 0 in a cool or neutral one. */
  sepia: number;
  /** Hue shift in degrees, small and negative for a cool room. */
  hue: number;
  /** Shadow opacity 0–0.5: stronger in a bright room, where a shadow shows. */
  shadow: number;
}

export function matchLighting(wall: Rgb | null, strength = 1): Lighting {
  if (!wall) return { brightness: 1, sepia: 0, hue: 0, shadow: 0.3 };
  const s = clamp(strength, 0, 1);
  const l = luma(wall);
  const w = warmth(wall);
  const brightness = 1 + (clamp(l / 0.8, 0.4, 1.15) - 1) * s;
  const sepia = w > 0.05 ? clamp((w - 0.05) * 1.2, 0, 0.35) * s : 0;
  const hue = w < -0.05 ? clamp((w + 0.05) * 40, -15, 0) * s : 0;
  const shadow = clamp(0.15 + l * 0.35, 0, 0.5);
  return { brightness, sepia, hue, shadow };
}

export function cssFilter(l: Lighting): string {
  const f = [`brightness(${l.brightness.toFixed(3)})`];
  if (l.sepia > 0) f.push(`sepia(${l.sepia.toFixed(3)})`);
  if (l.hue !== 0) f.push(`hue-rotate(${l.hue.toFixed(1)}deg)`);
  return f.join(' ');
}

/** Average of RGBA pixel data (as from a canvas), skipping transparent pixels. Null if none. */
export function averageRgb(data: ArrayLike<number>): Rgb | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < 8) continue;
    r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
  }
  return n ? { r: r / n, g: g / n, b: b / n } : null;
}
