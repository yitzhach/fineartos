/**
 * Turning an update into something the client can be given.
 *
 * Everything is built in the page and handed to the browser's own download.
 * Nothing is uploaded and nothing is sent: what the artist does with the file
 * afterwards — a text message, an email, AirDrop — is the artist's own doing,
 * which is exactly what a hand-off records.
 */

import { blobToDataUrl } from '../invoice/download';
import { cardFileStem, drawUpdateCard, renderUpdateHtml, type CardContext } from './updateRender';
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
  const html = renderUpdateHtml(update, context, await inlinePictures(pictures));
  triggerDownload(new Blob([html], { type: 'text/html' }), `${cardFileStem(update, context)}.html`);
}

/** The pictures an update carries, ready to be inlined into the page. */
async function inlinePictures(
  pictures: { blob: Blob | null; title: string }[],
): Promise<{ src: string; title: string }[]> {
  const inlined = [];
  for (const picture of pictures) {
    if (!picture.blob) continue;
    inlined.push({ src: await blobToDataUrl(picture.blob), title: picture.title });
  }
  return inlined;
}

/**
 * The same page, handed to the browser's own print dialog — which is where
 * "Save as PDF" lives on every desktop and on the phone. Nothing here writes a
 * PDF itself: the browser does, and the artist chooses the printer or the file.
 *
 * It is printed from a hidden iframe rather than a new tab, because a popup
 * blocker eats the tab and the artist is left wondering what happened. A
 * browser with no print at all says so rather than recording a hand-off that
 * never took place.
 */
export async function printUpdatePage(
  update: ClientUpdate,
  context: CardContext,
  pictures: { blob: Blob | null; title: string }[],
): Promise<'printed' | 'unsupported'> {
  const html = renderUpdateHtml(update, context, await inlinePictures(pictures), {
    forPrint: true,
  });

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.title = 'Printing';
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none';
  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('The page could not be prepared for printing.'));
      frame.srcdoc = html;
    });

    const view = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!view || !doc || typeof view.print !== 'function') return 'unsupported';

    // Data URIs still decode asynchronously, and printing before they land
    // prints the gaps where the pictures should be.
    await Promise.all(
      Array.from(doc.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.onload = () => resolve();
              image.onerror = () => resolve();
            }),
      ),
    );

    view.focus();
    view.print();
    return 'printed';
  } finally {
    // Left in place while the dialog is up; a removed frame prints nothing.
    setTimeout(() => frame.remove(), 1000);
  }
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
