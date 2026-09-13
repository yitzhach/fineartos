import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BAND_NAMES,
  applyAdjustments,
  describeAdjustments,
  isNeutral,
  mergeAdjustments,
  neutralAdjustments,
  type Adjustments,
  type BandName,
} from '../adjust';
import { isEdited, type Photo } from '../photo';

interface Props {
  photo: Photo;
  /** The *original* photograph's URL. An edit is never applied twice. */
  url: string | undefined;
  /** Saves over what the studio shows, keeping the original and the numbers. */
  onSaveEdit: (
    blob: Blob,
    adjustments: Adjustments,
    size: { width: number; height: number },
  ) => Promise<void> | void;
  /** Saves the edited pixels as a second picture in the studio. */
  onSaveCopy: (blob: Blob, changes: string[]) => Promise<void> | void;
  /** Puts the photograph back and forgets the numbers. */
  onRevert: () => Promise<void> | void;
  onMessage: (text: string) => void;
}

/** The longest edge the live preview is worked at, for speed. */
const PREVIEW_EDGE = 1400;

/**
 * The darkroom.
 *
 * The maths is all in adjust.ts; this loads the picture once, keeps the
 * original pixels, and re-runs the pipeline over them whenever a slider
 * moves. Two things make that fast enough to feel live: the preview works on
 * a copy no bigger than 1400px, and a move is coalesced into the next
 * animation frame rather than redrawing per pixel of slider travel.
 *
 * **The photograph is never written over.** Saving an edit keeps the original
 * beside the picture and stores the numbers that made it, so the edit can be
 * changed or undone months later and nothing is ever applied twice — the
 * editor always works from the original, whatever is on show. Save as a new
 * picture makes a second one instead. An edit is an opinion, and the
 * photograph underneath it is the only copy the artist has.
 */
export function ImageEditor({ photo, url, onSaveEdit, onSaveCopy, onRevert, onMessage }: Props) {
  // Opens where the last edit left off, read from the picture's own record.
  const [adjustments, setAdjustments] = useState<Adjustments>(() => mergeAdjustments(photo.edit));
  const [band, setBand] = useState<BandName>('yellow');
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The picture as it came in, at preview size. Never written to. */
  const originalRef = useRef<ImageData | null>(null);
  /** Where the pipeline writes: one buffer, reused every frame. */
  const workingRef = useRef<ImageData | null>(null);
  const frameRef = useRef<number | null>(null);
  /** The adjustments a queued frame should draw — a ref, so it is never stale. */
  const pendingRef = useRef<Adjustments>(adjustments);
  const sourceRef = useRef<HTMLImageElement | null>(null);

  const changes = useMemo(() => describeAdjustments(adjustments), [adjustments]);
  const untouched = isNeutral(adjustments);

  const draw = useCallback((settings: Adjustments) => {
    const canvas = canvasRef.current;
    const original = originalRef.current;
    const working = workingRef.current;
    if (!canvas || !original || !working) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    applyAdjustments(original.data, settings, working.data);
    context.putImageData(working, 0, 0);
  }, []);

  // Load the picture once, at a size that can be re-processed in a frame.
  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      sourceRef.current = image;
      const scale = Math.min(1, PREVIEW_EDGE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        setProblem('This browser did not provide a 2D canvas to work in.');
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      originalRef.current = context.getImageData(0, 0, width, height);
      workingRef.current = context.createImageData(width, height);
      setReady(true);
      // Painted here rather than left to the effect below. Loading again with
      // `ready` already true — which is what happens the moment an edit is
      // saved, because the picture's URL changes — sets no state, so nothing
      // would re-run and the canvas would sit there showing the untouched
      // photograph while the sliders said otherwise.
      draw(pendingRef.current);
    };
    image.onerror = () => {
      if (!cancelled) setProblem('That picture could not be opened for editing.');
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [draw, url]);


  // One redraw per animation frame, whatever the sliders are doing.
  useEffect(() => {
    // Kept current even before the picture has loaded, because that is what
    // the loader paints with the moment it has something to paint on.
    pendingRef.current = compare ? neutralAdjustments() : adjustments;
    if (!ready) return undefined;
    if (frameRef.current !== null) return undefined;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      draw(pendingRef.current);
    });
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [adjustments, compare, draw, ready]);

  const set = (changed: Partial<Adjustments>) =>
    setAdjustments((current) => ({ ...current, ...changed }));
  const setBandValue = (name: BandName, changed: Partial<Adjustments['bands'][BandName]>) =>
    setAdjustments((current) => ({
      ...current,
      bands: { ...current.bands, [name]: { ...current.bands[name], ...changed } },
    }));

  /** Renders at full size, which is what gets saved or downloaded. */
  const renderFull = async (): Promise<Blob | null> => {
    const image = sourceRef.current;
    if (!image) return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    applyAdjustments(data.data, adjustments, data.data);
    context.putImageData(data, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  };

  const saveOver = async () => {
    setBusy(true);
    try {
      const blob = await renderFull();
      const image = sourceRef.current;
      if (!blob || !image) {
        onMessage('That edit could not be rendered. Nothing was saved.');
        return;
      }
      await onSaveEdit(blob, adjustments, { width: image.width, height: image.height });
    } finally {
      setBusy(false);
    }
  };

  const saveCopy = async () => {
    setBusy(true);
    try {
      const blob = await renderFull();
      if (!blob) {
        onMessage('That edit could not be rendered. Nothing was saved.');
        return;
      }
      await onSaveCopy(blob, changes);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const blob = await renderFull();
      if (!blob) {
        onMessage('That edit could not be rendered.');
        return;
      }
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `${photo.title || 'artwork'} (edited).jpg`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      onMessage('Saved to your downloads. The picture in the studio is untouched.');
    } finally {
      setBusy(false);
    }
  };

  const current = adjustments.bands[band];

  return (
    <div className="ed">
      <div className="ed-stage">
        <canvas ref={canvasRef} className="ed-canvas" />
        {!ready && !problem && <p className="hint">Opening the picture…</p>}
        {problem && <p className="notice">{problem}</p>}
        <div className="ed-stage-bar">
          <button
            className="btn"
            data-variant="quiet"
            // Held down rather than toggled: this is "what did it look like
            // before", which is a glance, not a mode.
            onPointerDown={() => setCompare(true)}
            onPointerUp={() => setCompare(false)}
            onPointerLeave={() => setCompare(false)}
            disabled={untouched}
          >
            Hold to compare
          </button>
          <span className="hint">
            {untouched
              ? 'Nothing changed yet.'
              : `${changes.length === 1 ? '1 change' : `${changes.length} changes`}: ${changes.join(', ')}`}
          </span>
        </div>
      </div>

      <div className="ed-controls">
        <fieldset className="section">
          <legend>Light</legend>
          <Slider label="Exposure" value={adjustments.exposure} onChange={(v) => set({ exposure: v })} />
          <Slider label="Contrast" value={adjustments.contrast} onChange={(v) => set({ contrast: v })} />
          <Slider label="Highlights" value={adjustments.highlights} onChange={(v) => set({ highlights: v })} />
          <Slider label="Shadows" value={adjustments.shadows} onChange={(v) => set({ shadows: v })} />
        </fieldset>

        <fieldset className="section">
          <legend>Levels</legend>
          <Slider
            label="Black point"
            value={adjustments.blackPoint}
            min={0}
            max={100}
            onChange={(v) => set({ blackPoint: v })}
          />
          <Slider
            label="White point"
            value={adjustments.whitePoint}
            min={0}
            max={100}
            onChange={(v) => set({ whitePoint: v })}
          />
          <Slider
            label="Midtones"
            value={adjustments.gamma}
            min={0.2}
            max={2.5}
            step={0.01}
            onChange={(v) => set({ gamma: v })}
          />
        </fieldset>

        <fieldset className="section">
          <legend>Colour</legend>
          <Slider
            label="Temperature"
            value={adjustments.temperature}
            onChange={(v) => set({ temperature: v })}
          />
          <Slider label="Saturation" value={adjustments.saturation} onChange={(v) => set({ saturation: v })} />
          <Slider
            label="Hue"
            value={adjustments.hue}
            min={-180}
            max={180}
            onChange={(v) => set({ hue: v })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={adjustments.blackAndWhite}
              onChange={(e) => set({ blackAndWhite: e.target.checked })}
            />
            <span>Black and white</span>
          </label>
          <span className="hint">
            Applied last, so the colour bands below work as a channel mixer — dropping the blues
            darkens a sky.
          </span>
        </fieldset>

        <fieldset className="section">
          <legend>One colour at a time</legend>
          <p className="hint">
            Pick a band and move it. Only pixels near that hue change, and greys are left alone —
            so the yellows can go to red without the whole picture turning.
          </p>
          <div className="chip-row ed-bands">
            {BAND_NAMES.map((name) => {
              const touched =
                adjustments.bands[name].hue !== 0 ||
                adjustments.bands[name].saturation !== 0 ||
                adjustments.bands[name].luminance !== 0;
              return (
                <button
                  key={name}
                  className="btn ed-band"
                  data-variant={band === name ? 'primary' : 'quiet'}
                  data-band={name}
                  aria-pressed={band === name}
                  onClick={() => setBand(name)}
                >
                  <span className="ed-swatch" aria-hidden="true" />
                  {name}
                  {touched && <span className="ed-band-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <Slider
            label={`${band}: hue`}
            value={current.hue}
            min={-180}
            max={180}
            onChange={(v) => setBandValue(band, { hue: v })}
          />
          <Slider
            label={`${band}: saturation`}
            value={current.saturation}
            onChange={(v) => setBandValue(band, { saturation: v })}
          />
          <Slider
            label={`${band}: luminance`}
            value={current.luminance}
            onChange={(v) => setBandValue(band, { luminance: v })}
          />
        </fieldset>

        <div className="chip-row">
          <button
            className="btn"
            data-variant="primary"
            disabled={busy || untouched || !ready}
            onClick={() => void saveOver()}
          >
            {busy ? 'Working…' : 'Save the edit'}
          </button>
          <button
            className="btn"
            disabled={busy || untouched || !ready}
            onClick={() => void saveCopy()}
          >
            Save as a new picture
          </button>
          <button className="btn" disabled={busy || !ready} onClick={() => void download()}>
            Download{ready && sourceRef.current
              ? ` · ${sourceRef.current.width} × ${sourceRef.current.height}`
              : ''}
          </button>
          <button
            className="btn"
            data-variant="quiet"
            disabled={untouched}
            onClick={() => setAdjustments(neutralAdjustments())}
          >
            Reset
          </button>
          {isEdited(photo) && (
            <button
              className="btn"
              data-variant="quiet"
              disabled={busy}
              onClick={() => void onRevert()}
            >
              Back to the photograph
            </button>
          )}
        </div>
        <span className="hint">
          Save the edit changes what the studio shows and keeps the photograph underneath it, so
          this can be reopened and changed — or put back — at any point. Save as a new picture
          leaves this one alone and adds a second. Download writes a JPEG at the size above.
        </span>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = `ed-${label.replace(/[^a-z]+/gi, '-').toLowerCase()}`;
  return (
    <div className="field ed-slider">
      <label htmlFor={id}>
        {label}
        <span className="ed-value">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // A double click puts one control back where it started, which is
        // quicker than hunting for the number it had.
        onDoubleClick={() => onChange(label.includes('Midtones') ? 1 : 0)}
      />
    </div>
  );
}
