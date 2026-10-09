/**
 * Prints a whole HTML document through a hidden frame, so the sheet is the
 * page — no app around it — and the windows behind stay as they were.
 * Resolves once the print dialog has been handed the sheet; rejects with a
 * plain reason when the browser would not (rule 5: never silent).
 */
export function printSheet(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        return reject(new Error('This browser would not open the sheet for printing.'));
      }
      // Pictures first, or the certificate prints with an empty box.
      const images = Array.from(win.document.images);
      Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))))
        .then(() => {
          try {
            win.focus();
            win.print();
            resolve();
          } catch (cause) {
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          } finally {
            // Focus back to the app, or the shell's keys go to the hidden frame.
            frame.blur();
            window.focus();
            (document.activeElement as HTMLElement | null)?.blur?.();
            // Long enough for the dialog to take the page; the frame is gone after.
            window.setTimeout(() => frame.remove(), 60_000);
          }
        });
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
