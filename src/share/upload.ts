import { fitWithin, type ShareCreated } from './viewLink';

/**
 * The app's side of viewing links: ask whether they are on, upload one
 * picture, remove a link. Every failure throws a sentence fit to show the
 * artist, never a status code.
 */

export async function viewLinksAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/share/status', { credentials: 'same-origin' });
    return res.ok && Boolean(((await res.json()) as { available?: boolean }).available);
  } catch {
    return false;
  }
}

async function answer<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message || `The studio answered ${res.status}.`);
  return body?.data as T;
}

/**
 * Re-drawn as a JPEG at most 2400px on its longest edge: small enough for any
 * phone on a show-floor connection, and the camera's metadata (including where
 * it was taken) is left behind rather than handed to a client.
 */
async function prepare(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the picture.');
    context.drawImage(bitmap, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!out) throw new Error('This browser could not prepare the picture.');
    return out;
  } finally {
    bitmap.close();
  }
}

export async function createViewLink(picture: Blob, title: string, details: string): Promise<ShareCreated> {
  const form = new FormData();
  form.set('picture', await prepare(picture), 'picture.jpg');
  form.set('title', title);
  form.set('details', details);
  let res: Response;
  try {
    res = await fetch('/share/pictures', { method: 'POST', body: form, credentials: 'same-origin' });
  } catch {
    throw new Error('Couldn’t reach the studio. Check the connection and try again.');
  }
  return answer<ShareCreated>(res);
}

export async function removeViewLink(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/share/pictures/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
  } catch {
    throw new Error('Couldn’t reach the studio. The link still works.');
  }
  await answer(res);
}
