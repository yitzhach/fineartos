import { describe, expect, it } from 'vitest';
import {
  BAND_NAMES,
  applyAdjustments,
  bandWeight,
  describeAdjustments,
  hslToRgb,
  isNeutral,
  neutralAdjustments,
  rgbToHsl,
  wrapHue,
  type Adjustments,
} from '../adjust';

/** One pixel, as a canvas hands it over. */
const pixel = (r: number, g: number, b: number, alpha = 255) =>
  new Uint8ClampedArray([r, g, b, alpha]);

const run = (rgb: [number, number, number], changes: Partial<Adjustments>) => {
  const result = applyAdjustments(pixel(...rgb), { ...neutralAdjustments(), ...changes });
  return [result[0], result[1], result[2], result[3]];
};

describe('neutral', () => {
  it('leaves every pixel exactly as it found it', () => {
    const source = new Uint8ClampedArray([12, 200, 77, 255, 0, 0, 0, 128]);
    expect([...applyAdjustments(source, neutralAdjustments())]).toEqual([...source]);
  });

  it('knows when nothing has been changed', () => {
    expect(isNeutral(neutralAdjustments())).toBe(true);
    expect(isNeutral({ ...neutralAdjustments(), contrast: 1 })).toBe(false);
    expect(isNeutral({ ...neutralAdjustments(), blackAndWhite: true })).toBe(false);
  });

  it('does not write over the pixels it was given', () => {
    const source = pixel(100, 100, 100);
    applyAdjustments(source, { ...neutralAdjustments(), exposure: 50 });
    expect([...source]).toEqual([100, 100, 100, 255]);
  });

  it('carries alpha through untouched', () => {
    expect(run([10, 10, 10, 64] as never, { exposure: 80 })[3]).toBe(64);
  });
});

describe('tone', () => {
  it('brightens and darkens with exposure', () => {
    expect(run([100, 100, 100], { exposure: 50 })[0]).toBeGreaterThan(100);
    expect(run([100, 100, 100], { exposure: -50 })[0]).toBeLessThan(100);
  });

  it('pushes contrast away from the midpoint in both directions', () => {
    expect(run([200, 200, 200], { contrast: 50 })[0]).toBeGreaterThan(200);
    expect(run([40, 40, 40], { contrast: 50 })[0]).toBeLessThan(40);
  });

  it('works the bright end with highlights and the dark end with shadows', () => {
    const bright = 230;
    const dark = 30;
    // Highlights move the bright pixel much more than the dark one.
    const brightMoved = Math.abs(run([bright, bright, bright], { highlights: -60 })[0]! - bright);
    const darkMoved = Math.abs(run([dark, dark, dark], { highlights: -60 })[0]! - dark);
    expect(brightMoved).toBeGreaterThan(darkMoved);
    // And shadows the other way round.
    expect(Math.abs(run([dark, dark, dark], { shadows: 60 })[0]! - dark)).toBeGreaterThan(
      Math.abs(run([bright, bright, bright], { shadows: 60 })[0]! - bright),
    );
  });

  it('clips to black under the black point and to white over the white point', () => {
    expect(run([20, 20, 20], { blackPoint: 20 })).toEqual([0, 0, 0, 255]);
    expect(run([230, 230, 230], { whitePoint: 20 })).toEqual([255, 255, 255, 255]);
  });

  it('lifts the midtones with gamma without moving black or white', () => {
    expect(run([128, 128, 128], { gamma: 1.6 })[0]).toBeGreaterThan(128);
    expect(run([0, 0, 0], { gamma: 1.6 })[0]).toBe(0);
    expect(run([255, 255, 255], { gamma: 1.6 })[0]).toBe(255);
  });

  it('warms towards red and cools towards blue', () => {
    const warm = run([120, 120, 120], { temperature: 60 });
    expect(warm[0]).toBeGreaterThan(120);
    expect(warm[2]).toBeLessThan(120);
    const cool = run([120, 120, 120], { temperature: -60 });
    expect(cool[2]).toBeGreaterThan(120);
  });
});

describe('colour', () => {
  it('drains to grey at −100 saturation', () => {
    const [r, g, b] = run([200, 40, 40], { saturation: -100 });
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('turns the whole picture with a global hue rotation', () => {
    // Red rotated 120° is green.
    const [r, g, b] = run([255, 0, 0], { hue: 120 });
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(40);
    expect(b).toBeLessThan(40);
  });

  it('makes a grey out of black and white last', () => {
    const [r, g, b] = run([255, 0, 0], { blackAndWhite: true });
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(50);
  });
});

describe('the colour bands', () => {
  const shift = (band: 'yellow' | 'blue', changes: Partial<Adjustments['bands']['yellow']>) => ({
    ...neutralAdjustments(),
    bands: { ...neutralAdjustments().bands, [band]: { hue: 0, saturation: 0, luminance: 0, ...changes } },
  });

  it('takes the yellows to red and leaves the blues alone', () => {
    const yellow = pixel(220, 200, 30);
    const blue = pixel(40, 70, 210);
    const settings = shift('yellow', { hue: -55 });

    const movedYellow = applyAdjustments(yellow, settings);
    const [yellowHue] = rgbToHsl(movedYellow[0]! / 255, movedYellow[1]! / 255, movedYellow[2]! / 255);
    // Yellow sits near 55°; taken 55° down it is red, near 0 or near 360.
    expect(Math.min(yellowHue, 360 - yellowHue)).toBeLessThan(20);

    expect([...applyAdjustments(blue, settings)]).toEqual([...blue]);
  });

  it('leaves a grey alone even though a grey has a hue', () => {
    const grey = pixel(128, 128, 128);
    expect([...applyAdjustments(grey, shift('yellow', { hue: 120, saturation: 100 }))]).toEqual([
      ...grey,
    ]);
  });

  it('barely touches a nearly-grey pixel, so nothing gets tinted', () => {
    const nearlyGrey = pixel(130, 129, 126);
    const out = applyAdjustments(nearlyGrey, shift('yellow', { hue: 120 }));
    for (let channel = 0; channel < 3; channel += 1) {
      expect(Math.abs(out[channel]! - nearlyGrey[channel]!)).toBeLessThanOrEqual(4);
    }
  });

  it('drains one band without draining the rest', () => {
    const settings = shift('blue', { saturation: -100 });
    const blue = applyAdjustments(pixel(40, 70, 210), settings);
    expect(Math.max(blue[0]!, blue[1]!, blue[2]!) - Math.min(blue[0]!, blue[1]!, blue[2]!)).toBeLessThan(
      30,
    );
    const red = pixel(210, 40, 40);
    expect([...applyAdjustments(red, settings)]).toEqual([...red]);
  });

  it('fades between neighbouring bands rather than stepping', () => {
    // Halfway between yellow and green belongs to both, and to neither fully.
    const between = (55 + 120) / 2;
    expect(bandWeight(between, 'yellow')).toBeGreaterThan(0);
    expect(bandWeight(between, 'yellow')).toBeLessThan(1);
    expect(bandWeight(55, 'yellow')).toBe(1);
    expect(bandWeight(225, 'yellow')).toBe(0);
  });

  it('has a weight for every band at its own centre', () => {
    for (const name of BAND_NAMES) {
      expect(bandWeight(({ red: 0, orange: 30, yellow: 55, green: 120, cyan: 180, blue: 225, purple: 275, magenta: 320 })[name], name)).toBe(1);
    }
  });
});

describe('hsl round trip', () => {
  it('comes back to where it started', () => {
    const cases: [number, number, number][] = [
      [0.2, 0.6, 0.9],
      [1, 0, 0],
      [0.5, 0.5, 0.5],
      [0, 0, 0],
      [1, 1, 1],
    ];
    for (const rgb of cases) {
      const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      const back = hslToRgb(h, s, l);
      for (let i = 0; i < 3; i += 1) expect(back[i]).toBeCloseTo(rgb[i]!, 5);
    }
  });

  it('wraps the wheel in both directions', () => {
    expect(wrapHue(370)).toBe(10);
    expect(wrapHue(-30)).toBe(330);
  });
});

describe('describeAdjustments', () => {
  it('says nothing when nothing was changed', () => {
    expect(describeAdjustments(neutralAdjustments())).toEqual([]);
  });

  it('names what was changed, and by how much', () => {
    const said = describeAdjustments({
      ...neutralAdjustments(),
      exposure: 12,
      blackAndWhite: true,
      bands: { ...neutralAdjustments().bands, yellow: { hue: -55, saturation: 0, luminance: 10 } },
    });
    expect(said).toContain('Exposure +12');
    expect(said).toContain('Black and white');
    expect(said).toContain('yellow (hue -55, luminance +10)');
  });
});
