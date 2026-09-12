import { useEffect, useState } from 'react';
import { CROSSFADE_MS, nextIndex } from '../lib/slideshow';

interface Props {
  /** Object URLs, in the order they were picked. Two or more, or nothing runs. */
  urls: string[];
  /** How long each picture is up, crossfade included. From `secondsPerSlide`. */
  seconds: number;
  /** Straight cuts instead of dissolves, for a viewer who asked for less motion. */
  reducedMotion: boolean;
}

/**
 * The desktop's pictures, one at a time, dissolving between them.
 *
 * Every picture is a layer and only the current one is opaque, so a crossfade
 * is one opacity transition rather than any kind of animation loop. The
 * layers sit behind the workspace's own scrim and dim — see the z-index in
 * styles.css — so the darkening controls apply to a slideshow exactly as they
 * do to a still picture.
 *
 * The timing arithmetic is all in src/lib/slideshow.ts. This only counts.
 */
export function WallpaperSlides({ urls, seconds, reducedMotion }: Props) {
  const [index, setIndex] = useState(0);

  // A picture removed from the set can leave the index past the end.
  const current = urls.length === 0 ? 0 : index % urls.length;

  useEffect(() => {
    if (urls.length < 2) return undefined;
    const timer = setTimeout(() => {
      setIndex((i) => nextIndex(i, urls.length));
    }, Math.max(1, seconds) * 1000);
    return () => clearTimeout(timer);
    // `current` rather than `index`: the wait restarts when the picture on
    // screen changes, including when the set itself changed underneath it.
  }, [current, seconds, urls.length]);

  if (urls.length === 0) return null;

  return (
    <div className="wp-slides" aria-hidden="true">
      {urls.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="wp-slide"
          style={{
            backgroundImage: `url(${url})`,
            opacity: i === current ? 1 : 0,
            transitionDuration: reducedMotion ? '0ms' : `${CROSSFADE_MS}ms`,
          }}
        />
      ))}
    </div>
  );
}
