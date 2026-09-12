import { describe, expect, it } from 'vitest';
import {
  CROSSFADE_MS,
  MAX_SLIDES,
  MIN_SECONDS,
  describeDuration,
  emptySlideshow,
  isFull,
  loopSeconds,
  nextIndex,
  readySlides,
  secondsPerSlide,
  slideshowProblem,
  timingNote,
  toggleSlide,
} from '../slideshow';

const withIds = (count: number) => ({
  ...emptySlideshow(),
  imageIds: Array.from({ length: count }, (_, i) => `img-${i}`),
});

describe('picking the pictures', () => {
  it('adds and takes away', () => {
    const one = toggleSlide(emptySlideshow(), 'a');
    expect(one.imageIds).toEqual(['a']);
    expect(toggleSlide(one, 'a').imageIds).toEqual([]);
  });

  it('keeps the order they were picked in', () => {
    const show = ['a', 'b', 'c'].reduce(toggleSlide, emptySlideshow());
    expect(show.imageIds).toEqual(['a', 'b', 'c']);
  });

  it('refuses the twenty-first rather than dropping one already picked', () => {
    const full = withIds(MAX_SLIDES);
    expect(isFull(full)).toBe(true);
    expect(toggleSlide(full, 'one-more').imageIds).toHaveLength(MAX_SLIDES);
  });

  it('leaves out a picture deleted from the library', () => {
    expect(readySlides(withIds(3), ['img-0', 'img-2'])).toEqual(['img-0', 'img-2']);
  });
});

describe('what it refuses to run on', () => {
  it('says so with nothing to show', () => {
    expect(slideshowProblem(emptySlideshow(), 0)).toMatch(/pictures of your own/i);
  });

  it('says so with one picture, which is a wallpaper not a slideshow', () => {
    expect(slideshowProblem(withIds(1), 4)).toMatch(/at least two/i);
  });

  it('is happy with two', () => {
    expect(slideshowProblem(withIds(2), 4)).toBeNull();
  });
});

describe('timing', () => {
  it('takes seconds each at face value', () => {
    expect(secondsPerSlide({ ...withIds(5), timing: 'each', seconds: 8 })).toBe(8);
    expect(loopSeconds({ ...withIds(5), timing: 'each', seconds: 8 })).toBe(40);
  });

  it('divides a whole loop between the pictures', () => {
    expect(secondsPerSlide({ ...withIds(4), timing: 'loop', seconds: 60 })).toBe(15);
  });

  it('never leaves a picture up for less than the crossfade', () => {
    const rushed = { ...withIds(20), timing: 'loop' as const, seconds: 5 };
    expect(secondsPerSlide(rushed)).toBe(MIN_SECONDS);
    expect(MIN_SECONDS * 1000).toBeGreaterThan(CROSSFADE_MS);
    // And it says the loop will take longer than was asked for.
    expect(timingNote(rushed)).toMatch(/floor/);
  });

  it('says what will happen in words', () => {
    expect(timingNote({ ...withIds(6), timing: 'each', seconds: 20 })).toBe(
      '20 seconds on each picture — the whole set takes 2 minutes.',
    );
  });

  it('reads a duration the way a person says it', () => {
    expect(describeDuration(45)).toBe('45 seconds');
    expect(describeDuration(60)).toBe('1 minute');
    expect(describeDuration(150)).toBe('2 minutes 30 seconds');
    expect(describeDuration(1.3)).toBe('1.3 seconds');
  });
});

describe('nextIndex', () => {
  it('wraps back to the first', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
  });

  it('stays put with nothing to show', () => {
    expect(nextIndex(0, 0)).toBe(0);
  });
});
