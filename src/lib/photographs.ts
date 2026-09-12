/**
 * Photographs that ship with the app.
 *
 * The ten bundled wallpapers are drawn as SVG — a few kilobytes each. These
 * are real pictures, which are not, so they are handled differently:
 *
 *  - They are files under `public/wallpapers/photographs/`, served by
 *    Cloudflare as static assets. Nothing about them is in the JavaScript
 *    bundle, and the browser fetches one only when the artist picks it.
 *  - They are deliberately *not* in the service worker's install list. The
 *    ten SVGs are precached because a desktop with no background looks
 *    broken offline; precaching megabytes of photographs would make the
 *    first load pay for pictures nobody has chosen. The worker caches each
 *    one the first time it is used instead, so it is offline from then on.
 *  - This list is written by `scripts/prepare-wallpapers.mjs`, which is also
 *    what resizes and re-encodes them. Add pictures by putting them in
 *    `wallpaper-source/` and running `npm run wallpapers`; do not add an
 *    entry here by hand, because an entry with no file behind it is a broken
 *    tile in the picker.
 *
 * Empty is a normal state: it means no photographs have been prepared yet,
 * and the picker simply does not show the section.
 */

export interface ShippedPhotograph {
  /** Path under public/, which is also its key in a slideshow. */
  src: string;
  /** A small version for the picker, so the grid does not load full pictures. */
  thumb: string;
  name: string;
  width: number;
  height: number;
  /** File size in bytes, so the picker can be honest about the download. */
  bytes: number;
}

export const SHIPPED_PHOTOGRAPHS: ShippedPhotograph[] = [
  /* BEGIN GENERATED — npm run wallpapers rewrites everything between these. */
  /* END GENERATED */
];

/** A slide key that is a shipped photograph rather than one of the artist's. */
export function isPhotographKey(key: string): boolean {
  return key.startsWith('/wallpapers/');
}

export function findPhotograph(src: string): ShippedPhotograph | null {
  return SHIPPED_PHOTOGRAPHS.find((photograph) => photograph.src === src) ?? null;
}

/** "1.2 MB", "480 KB" — what the artist is about to download. */
export function describeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
