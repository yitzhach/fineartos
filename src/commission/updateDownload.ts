/**
 * Turning an update into something the client can be given.
 *
 * Everything is built in the page and handed to the browser's own download.
 * Nothing is uploaded and nothing is sent: what the artist does with the file
 * afterwards — a text message, an email, AirDrop — is the artist's own doing,
 * which is exactly what a hand-off records.
 */

import { blobToDataUrl } from '../invoice/download';
import {
  cardFileStem,
  drawUpdateCard,
  renderUpdateHtml,
  renderUpdatePrintHtml,
  type CardContext,
} from './updateRender';
import type { ClientUpdate } from './updates';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoked late: revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Loads the pictures a card draws. A picture that will not load is left out. */
export async function loadPictures(urls: string[]): Promise<HTMLImageElement[]> {
  const loaded = await Promise.all(
    urls.map(
      (url) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = url;
        }),
    ),
  );
  return loaded.filter((image): image is HTMLImageElement => image !== null);
}

/** The card as a JPEG — the one that lands in a text message. */
export async function downloadUpdateCard(
  update: ClientUpdate,
  context: CardContext,
  urls: string[],
): Promise<void> {
  const pictures = await loadPictures(urls);
  const canvas = document.createElement('canvas');
  drawUpdateCard(canvas, update, context, pictures, 2);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('This browser could not produce a picture from the update.');
  triggerDownload(blob, `${cardFileStem(update, context)}.jpg`);
}

/** The same card, as one self-contained page with its pictures inlined. */
export async function downloadUpdatePage(
  update: ClientUpdate,
  context: CardContext,
  pictures: { blob: Blob | null; title: string }[],
): Promise<void> {
  const inlined = [];
  for (const picture of pictures) {
    if (!picture.blob) continue;
    inlined.push({ src: await blobToDataUrl(picture.blob), title: picture.title });
  }
  const html = renderUpdateHtml(update, context, inlined);
  triggerDownload(new Blob([html], { type: 'text/html' }), `${cardFileStem(update, context)}.html`);
}

/**
 * The card as a file the phone's own share sheet can carry, with the message
 * beside it. Returns what happened, because a browser with no share sheet is
 * a normal case rather than an error — the caller says so and offers Save.
 */
export async function shareUpdateCard(
  update: ClientUpdate,
  context: CardContext,
  urls: string[],
  message: string,
): Promise<'shared' | 'unsupported' | 'cancelled'> {
  const pictures = await loadPictures(urls);
  const canvas = document.createElement('canvas');
  drawUpdateCard(canvas, update, context, pictures, 2);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) return 'unsupported';

  const file = new File([blob], `${cardFileStem(update, context)}.jpg`, { type: 'image/jpeg' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], text: message, title: update.headline });
    return 'shared';
  } catch (cause) {
    // A cancelled share throws too, and that is not a failure worth shouting
    // about — the artist changed their mind.
    return (cause as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/**
 * The same update, handed to the browser's own print dialog — which is where
 * every desktop and phone browser keeps "Save as PDF".
 *
 * The sheet is built in a hidden frame from the records, not from the screen,
 * so nothing on screen can end up on the paper. The frame is kept until the
 * dialog closes: taking it away too early cancels the print in some browsers.
 * Returns 'unsupported' rather than throwing when the browser has no print —
 * the caller says so plainly and leaves Save as a page to do the job.
 */
export async function printUpdatePage(
  update: ClientUpdate,
  context: CardContext,
  pictures: { blob: Blob | null; title: string }[],
): Promise<'printed' | 'unsupported'> {
  const inlined = [];
  for (const picture of pictures) {
    if (!picture.blob) continue;
    inlined.push({ src: await blobToDataUrl(picture.blob), title: picture.title });
  }
  const html = renderUpdatePrintHtml(update, context, inlined);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
  document.body.appendChild(frame);

  const remove = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  try {
    await new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true });
      frame.srcdoc = html;
    });
    const view = frame.contentWindow;
    if (!view || typeof view.print !== 'function') {
      remove();
      return 'unsupported';
    }
    // The pictures are data: URIs and decode in the frame; printing before
    // they are ready prints blank boxes.
    await Promise.all(
      Array.from(frame.contentDocument?.images ?? []).map((image) =>
        image.complete ? Promise.resolve() : image.decode().catch(() => undefined),
      ),
    );
    // Some browsers fire afterprint, some do not; whichever comes first wins,
    // and the frame never outlives the dialog by more than a minute.
    view.addEventListener?.('afterprint', remove, { once: true });
    setTimeout(remove, 60000);
    view.focus();
    view.print();
    return 'printed';
  } catch (cause) {
    remove();
    throw cause;
  }
}
