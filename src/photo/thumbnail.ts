/**
 * Thumbnails: a small copy beside each original, so the desktop and lists
 * decode a few kilobytes instead of a full photograph. The original is never
 * replaced (rule 9); the full picture loads only where it is actually shown.
 */

export const THUMB_EDGE = 480;

/** The size a thumbnail is drawn at: long side at most `edge`, never enlarged. */
export function thumbnailSize(width: number, height: number, edge = THUMB_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Makes the thumbnail in the browser. WebP where the browser can write it,
 * JPEG where it cannot. Null when the picture cannot be decoded here.
 */
export async function makeThumbnail(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = thumbnailSize(bitmap.width, bitmap.height);
    if (size.width === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
    const webp = await encode('image/webp');
    if (webp && webp.type === 'image/webp') return webp;
    return await encode('image/jpeg');
  } catch {
    return null;
  }
}
