/**
 * The desktop as a slideshow.
 *
 * A set of the artist's own pictures, shown one after another with a slow
 * crossfade between them. Everything about when a picture changes is worked
 * out here — the component only draws whichever one is current.
 *
 * The timing can be set either way round, because artists think about it both
 * ways: "ten seconds each", or "the whole set in five minutes". The second is
 * divided by however many pictures are in the set, and it is clamped: a loop
 * short enough to leave a picture on screen for less than the crossfade takes
 * would never be still, so the floor is stated rather than silently applied.
 *
 * DOM-free, like the rest of the model layer.
 */

/** As many as the desktop picker offers. Past this it is a screensaver. */
export const MAX_SLIDES = 20;

/** The crossfade, fixed: long enough to read as a dissolve, not a cut. */
export const CROSSFADE_MS = 1300;

/**
 * The shortest a picture stays. The crossfade is 1.3s at each end, so at 2s a
 * picture is fully itself for only a fraction of a second — below that it is
 * a flicker rather than a background.
 */
export const MIN_SECONDS = 2;
export const MAX_SECONDS = 3600;

/** Seconds each, or seconds for the whole set. */
export type SlideTiming = 'each' | 'loop';

export interface Slideshow {
  /** Image ids from the artist's own wallpaper library, in order. */
  imageIds: string[];
  timing: SlideTiming;
  /** Read as seconds per picture, or seconds for the whole loop. */
  seconds: number;
}

export function emptySlideshow(): Slideshow {
  return { imageIds: [], timing: 'each', seconds: 10 };
}

export function isFull(show: Slideshow): boolean {
  return show.imageIds.length >= MAX_SLIDES;
}

/**
 * Adds a picture, or takes it out again. A full set refuses the next one
 * rather than dropping one of the artist's own choices to make room.
 */
export function toggleSlide(show: Slideshow, imageId: string): Slideshow {
  if (show.imageIds.includes(imageId)) {
    return { ...show, imageIds: show.imageIds.filter((id) => id !== imageId) };
  }
  if (isFull(show)) return show;
  return { ...show, imageIds: [...show.imageIds, imageId] };
}

/** Only the pictures still in the library: one deleted since is not a gap. */
export function readySlides(show: Slideshow, available: Iterable<string>): string[] {
  const have = new Set(available);
  return show.imageIds.filter((id) => have.has(id));
}

/** Why the slideshow cannot run, or null when it can. */
export function slideshowProblem(show: Slideshow, availableCount: number): string | null {
  if (availableCount === 0) return 'Add some pictures of your own first — the slideshow uses those.';
  if (show.imageIds.length < 2) return 'Pick at least two pictures.';
  return null;
}

/**
 * How long each picture is on screen. A loop divided among its pictures can
 * come out under the floor; it is clamped here, and `timingNote` says so
 * rather than letting the loop quietly take longer than was asked for.
 */
export function secondsPerSlide(show: Slideshow, count = show.imageIds.length): number {
  const asked = show.timing === 'each' ? show.seconds : show.seconds / Math.max(1, count);
  if (!Number.isFinite(asked)) return MIN_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(asked * 10) / 10));
}

/** What the whole set actually takes, after any clamping. */
export function loopSeconds(show: Slideshow, count = show.imageIds.length): number {
  return Math.round(secondsPerSlide(show, count) * count * 10) / 10;
}

export function nextIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index + 1) % count;
}

/** "2 minutes 30 seconds", "45 seconds" — never "150s". */
export function describeDuration(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${trim(seconds)} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const head = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return rest === 0 ? head : `${head} ${rest} ${rest === 1 ? 'second' : 'seconds'}`;
}

/**
 * The sentence under the timing control: what was asked for, what will
 * actually happen, and the difference between them when there is one.
 */
export function timingNote(show: Slideshow, count = show.imageIds.length): string {
  if (count < 2) return 'Pick at least two pictures and the timing applies to each of them.';
  const each = secondsPerSlide(show, count);
  const loop = loopSeconds(show, count);
  const base = `${describeDuration(each)} on each picture — the whole set takes ${describeDuration(loop)}.`;
  if (show.timing === 'loop' && Math.abs(loop - show.seconds) >= 0.5) {
    return `${base} A loop that short would leave each picture up for less than the ${
      CROSSFADE_MS / 1000
    }s crossfade, so ${MIN_SECONDS} seconds each is the floor.`;
  }
  return base;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}
