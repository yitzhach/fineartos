/**
 * The artist's own desktop pictures.
 *
 * A library, not a single slot: upload as many as you like, switch between
 * them, delete the ones you are done with. The blobs live in IndexedDB with
 * every other image in the app; this module only ever handles the small
 * records that point at them, which is what lets it stay pure and tested.
 *
 * Two things worth knowing:
 *  - Deleting a wallpaper that is currently on the desktop has to put the
 *    desktop back on something. It falls back to a bundled picture rather
 *    than leaving the workspace pointing at an image that no longer exists.
 *  - A photograph straight off a phone is 3–6 MB and 4000px wide, which is
 *    far more than a background needs. Uploads are resized before they are
 *    stored, and the artist is told that they were.
 */

export interface CustomWallpaper {
  /** Image id in the IndexedDB image store. */
  imageId: string;
  /** The file's own name, so the artist recognises it. */
  name: string;
  addedAt: string;
  /** Pixel size after resizing, shown in the picker. */
  width: number;
  height: number;
}

/** How the picture is fitted to the screen. */
export type WallpaperFit = 'cover' | 'contain' | 'centre';

/** The longest edge an uploaded wallpaper is stored at. */
export const MAX_WALLPAPER_EDGE = 2560;

export function addWallpaper(
  library: CustomWallpaper[],
  wallpaper: CustomWallpaper,
): CustomWallpaper[] {
  // Newest first: the one just added is the one being looked for.
  return [wallpaper, ...library.filter((w) => w.imageId !== wallpaper.imageId)];
}

export function removeWallpaper(library: CustomWallpaper[], imageId: string): CustomWallpaper[] {
  return library.filter((w) => w.imageId !== imageId);
}

export function renameWallpaper(
  library: CustomWallpaper[],
  imageId: string,
  name: string,
): CustomWallpaper[] {
  return library.map((w) => (w.imageId === imageId ? { ...w, name } : w));
}

export function findWallpaper(library: CustomWallpaper[], imageId: string | null) {
  return library.find((w) => w.imageId === imageId) ?? null;
}

/**
 * Works out the size to store a picture at: never enlarged, never wider or
 * taller than MAX_WALLPAPER_EDGE, and the aspect ratio kept.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_WALLPAPER_EDGE,
): { width: number; height: number; resized: boolean } {
  if (width <= 0 || height <= 0) return { width, height, resized: false };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, resized: false };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

/** A readable file size, for the picker. */
export function describeSize(width: number, height: number): string {
  return `${width} × ${height}`;
}

/**
 * Resizes an uploaded picture and re-encodes it as JPEG.
 *
 * JPEG because a wallpaper is a photograph: a 4000px PNG off a phone can be
 * 12 MB, which the image store would refuse outright, and storing it at full
 * size would be wasteful even if it fitted. A picture already small enough is
 * still re-encoded, so every wallpaper in the library is the same kind of
 * thing and the size shown in the picker is the size actually stored.
 *
 * Rejects rather than guesses when the file is not a decodable image.
 */
export async function prepareWallpaper(
  file: File,
  maxEdge = MAX_WALLPAPER_EDGE,
): Promise<{ blob: Blob; width: number; height: number; resized: boolean }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`${file.name} could not be read as an image.`);

  const { width, height, resized } = fitWithin(bitmap.width, bitmap.height, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('This browser did not provide a 2D canvas context.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.88);
  });
  if (!blob) throw new Error(`${file.name} could not be prepared for use as a wallpaper.`);

  return { blob, width, height, resized };
}
