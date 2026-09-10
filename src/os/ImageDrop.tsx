import { useRef, useState, type DragEvent } from 'react';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../persistence/repository';

interface Props {
  /** Called for each accepted file. The caller stores it and updates the model. */
  onFiles: (files: File[]) => void;
  /** Shown inside the well when it is empty. */
  label?: string;
  hint?: string;
  /** A single-image well (a logo, the wallpaper) takes only the first file. */
  multiple?: boolean;
  /** An error from the caller's own store, e.g. a rejected image. */
  error?: string | null;
  children?: React.ReactNode;
}

const humanTypes = ALLOWED_IMAGE_TYPES.map((type) => type.replace('image/', '').toUpperCase()).join(', ');

/**
 * A drop target that is also a button. Dropping and choosing go through the
 * same path, so a file cannot arrive by one route and be validated by another.
 *
 * The type and size checks here are a courtesy that lets the artist see the
 * problem on the spot. They are not the real gate: the repository re-checks
 * every image before it is stored, and that check is the one that counts.
 */
export function ImageDrop({ onFiles, label, hint, multiple = true, error, children }: Props) {
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (fileList: FileList | null) => {
    setLocalError(null);
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        rejected.push(`${file.name} is not ${humanTypes}`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        rejected.push(`${file.name} is over ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
      } else {
        accepted.push(file);
      }
    }

    // Every rejection is named. A file that silently vanishes reads as a bug.
    if (rejected.length > 0) setLocalError(`Not added: ${rejected.join('; ')}.`);
    if (accepted.length > 0) onFiles(multiple ? accepted : accepted.slice(0, 1));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    accept(event.dataTransfer.files);
  };

  return (
    <div className="image-drop-wrap">
      <div
        className="image-drop"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {children}
        <button
          type="button"
          className="image-drop-target"
          onClick={() => inputRef.current?.click()}
        >
          <span className="plus" aria-hidden="true">+</span>
          <span className="drop-label">{label ?? 'Drop an image here'}</span>
          <span className="drop-hint">{hint ?? `or click to choose · ${humanTypes}`}</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        multiple={multiple}
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />

      {(localError || error) && (
        <p className="hint" style={{ color: 'var(--danger)' }}>{localError ?? error}</p>
      )}
    </div>
  );
}
