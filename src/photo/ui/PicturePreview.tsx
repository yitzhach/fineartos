import { useCallback, useEffect } from 'react';
import { describePrice, describeSize, describeStatus, type Photo } from '../photo';
import { isFullscreen, useFullscreen } from '../../os/fullscreen';

interface Props {
  /** The pictures to step through, in the order they are shown. */
  photos: Photo[];
  index: number;
  imageUrls: Record<string, string>;
  onIndex: (index: number) => void;
  onClose: () => void;
  onEdit: (photoId: string) => void;
}

/**
 * One picture, on its own, with everything else dimmed away.
 *
 * A manual slideshow rather than an automatic one: the artist is standing
 * next to somebody, talking, and the picture changes when they say so. Space
 * and the arrow keys step through, X closes it.
 *
 * **Escape and fullscreen.** If the app is in the browser's own fullscreen,
 * Escape belongs to the browser — it leaves fullscreen, and no page can stop
 * it. Closing the preview on the same keypress would throw away both at once,
 * so Escape here closes the preview *only* when the browser is not
 * fullscreen; when it is, the first Escape leaves fullscreen and the second
 * closes the preview. X does the same job in one press either way, which is
 * why the hint at the bottom says X first.
 */
export function PicturePreview({ photos, index, imageUrls, onIndex, onClose, onEdit }: Props) {
  const fullscreen = useFullscreen();
  const photo = photos[index] ?? null;
  const count = photos.length;

  const step = useCallback(
    (by: number) => {
      if (count === 0) return;
      onIndex((index + by + count) % count);
    },
    [count, index, onIndex],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          event.preventDefault();
          step(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault();
          step(-1);
          break;
        case 'Home':
          event.preventDefault();
          onIndex(0);
          break;
        case 'End':
          event.preventDefault();
          onIndex(Math.max(0, count - 1));
          break;
        case 'x':
        case 'X':
        case 'q':
        case 'Q':
          event.preventDefault();
          onClose();
          break;
        case 'Escape':
          // The browser is about to leave fullscreen on this same keypress.
          // Taking the preview with it would lose two things at once.
          if (!isFullscreen()) onClose();
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          void fullscreen.toggle();
          break;
        default:
          break;
      }
    };
    // Capture, so a focused control inside the app does not eat the arrows.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [count, fullscreen, onClose, onIndex, step]);

  if (!photo) return null;

  const url = imageUrls[photo.imageId];
  const size = describeSize(photo);
  const status = describeStatus(photo);

  return (
    <div
      className="pv"
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.title}, picture ${index + 1} of ${count}`}
      // A click on the dark surround closes; a click on the picture does not.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pv-bar">
        <div className="pv-title">
          <strong>{photo.title}</strong>
          <span>
            {[size, photo.medium, photo.year ? String(photo.year) : null, describePrice(photo), status]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="pv-actions">
          {count > 1 && (
            <span className="pv-count">
              {index + 1} of {count}
            </span>
          )}
          <button className="btn" data-variant="quiet" onClick={() => onEdit(photo.id)}>
            Edit
          </button>
          {fullscreen.supported && (
            <button className="btn" data-variant="quiet" onClick={() => void fullscreen.toggle()}>
              {fullscreen.active ? 'Leave fullscreen' : 'Fullscreen'}
            </button>
          )}
          <button className="btn" data-variant="quiet" onClick={onClose} aria-label="Close the preview">
            ✕
          </button>
        </div>
      </div>

      <div className="pv-stage">
        {count > 1 && (
          <button className="pv-step" data-side="back" onClick={() => step(-1)} aria-label="Previous picture">
            ‹
          </button>
        )}
        {url ? (
          <img className="pv-image" src={url} alt={photo.title} />
        ) : (
          <p className="hint">This picture is still loading.</p>
        )}
        {count > 1 && (
          <button className="pv-step" data-side="on" onClick={() => step(1)} aria-label="Next picture">
            ›
          </button>
        )}
      </div>

      <p className="pv-hint">
        {count > 1 ? 'Space or → for the next, ← to go back. ' : ''}X closes this
        {fullscreen.active
          ? ' — Escape leaves fullscreen first, so it takes two presses.'
          : ', and so does Escape.'}
      </p>
      {fullscreen.error && <p className="pv-hint">{fullscreen.error}</p>}
    </div>
  );
}
