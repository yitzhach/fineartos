/** Kept apart from the darkroom maths so the shell can ask this without loading it. */

import type { Adjustments, BandName } from './adjust';

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
