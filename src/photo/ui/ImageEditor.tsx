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
import {
  ASPECTS,
  FULL_CROP,
  MAX_ANGLE,
  clampBox,
  cropRect,
  describeFraming,
  insideRect,
  isFramed,
  neutralFraming,
  outputSize,
  rotatedBounds,
  withAspect,
  type CropBox,
  type Framing,
} from '../crop';
import { isEdited, type Photo } from '../photo';

interface Props {
  photo: Photo;
  /** The *original* photograph's URL. An edit is never applied twice. */
  url: string | undefined;
  /** Saves over what the studio shows, keeping the original and the numbers. */
  onSaveEdit: (
    blob: Blob,
    adjustments: Adjustments,
    framing: Framing,
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
  /** The crop and the straightening, which happen before any of the colour. */
  const [framing, setFraming] = useState<Framing>(() => photo.framing ?? neutralFraming());
  /**
   * Cropping is a mode. In it the whole straightened picture is shown with
   * the crop drawn over it, because you cannot choose what to cut off while
   * looking only at what is left.
   */
  const [cropping, setCropping] = useState(false);
  const [aspect, setAspect] = useState<string>('free');
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
  /** Bumped when the photograph has loaded, to rebuild what is drawn from it. */
  const [loaded, setLoaded] = useState(0);

  const changes = useMemo(() => describeAdjustments(adjustments), [adjustments]);
  // A plain size, not the <img> itself: the model spreads and measures it.
  const source = sourceRef.current
    ? { width: sourceRef.current.width, height: sourceRef.current.height }
    : null;
  const framingChanges = useMemo(
    () => describeFraming(framing, source ?? undefined),
    // The photograph's own size only matters for the words, and it does not
    // change once loaded; `loaded` is what says it is there at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [framing, loaded],
  );
  const untouched = isNeutral(adjustments) && !isFramed(framing);
  const allChanges = [...framingChanges, ...changes];

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

  // Load the photograph once. Everything below works from it.
  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      sourceRef.current = image;
      setLoaded((count) => count + 1);
    };
    image.onerror = () => {
      if (!cancelled) setProblem('That picture could not be opened for editing.');
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  /**
   * The pixels the colour pipeline runs on: the photograph straightened and
   * cut to the crop, at preview size. Rebuilt whenever the frame changes,
   * which is rarely — dragging a slider does not touch this.
   *
   * In crop mode the whole straightened picture is used instead of the crop,
   * so the box can be dragged around over what it is cutting from.
   */
  useEffect(() => {
    const image = sourceRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const base = renderFramed(
      image,
      cropping ? { angle: framing.angle, crop: { ...FULL_CROP } } : framing,
      PREVIEW_EDGE,
    );
    if (!base) {
      setProblem('This browser did not provide a 2D canvas to work in.');
      return;
    }
    canvas.width = base.width;
    canvas.height = base.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setProblem('This browser did not provide a 2D canvas to work in.');
      return;
    }
    context.drawImage(base, 0, 0);
    originalRef.current = context.getImageData(0, 0, base.width, base.height);
    workingRef.current = context.createImageData(base.width, base.height);
    setReady(true);
    // Painted here rather than left to the effect below: rebuilding the base
    // sets no state that effect watches, and the canvas would otherwise sit
    // showing the picture without its adjustments.
    draw(pendingRef.current);
  }, [cropping, draw, framing, loaded]);


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
    const canvas = renderFramed(image, framing, null);
    if (!canvas) return null;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
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
      await onSaveEdit(blob, adjustments, framing, outputSize(image, framing));
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
      await onSaveCopy(blob, [...changes, ...framingChanges]);
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
        <div className="ed-plate">
          <canvas ref={canvasRef} className="ed-canvas" />
          {cropping && (
            <CropOverlay box={framing.crop} onBox={(crop) => setFraming({ ...framing, crop })} />
          )}
        </div>
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
              : `${allChanges.length === 1 ? '1 change' : `${allChanges.length} changes`}: ${allChanges.join(', ')}`}
          </span>
        </div>
      </div>

      <div className="ed-controls">
        <fieldset className="section">
          <legend>Crop and straighten</legend>
          <div className="chip-row">
            <button
              className="btn"
              data-variant={cropping ? 'primary' : 'quiet'}
              aria-pressed={cropping}
              disabled={!ready}
              onClick={() => setCropping(!cropping)}
            >
              {cropping ? 'Done cropping' : 'Crop'}
            </button>
            <button
              className="btn"
              data-variant="quiet"
              disabled={!isFramed(framing)}
              onClick={() => {
                setFraming(neutralFraming());
                setAspect('free');
              }}
            >
              Whole picture
            </button>
          </div>

          {cropping && (
            <>
              <div className="field">
                <label>Shape</label>
                <div className="chip-row">
                  {ASPECTS.map((option) => (
                    <button
                      key={option.id}
                      className="btn"
                      data-variant={aspect === option.id ? 'primary' : 'quiet'}
                      aria-pressed={aspect === option.id}
                      onClick={() => {
                        setAspect(option.id);
                        // The crop is measured against the straightened
                        // picture, so a shape in pixels is a shape in *its*
                        // proportions — not the rotated box around it.
                        const picture = source
                          ? insideRect(source, framing.angle)
                          : { width: 1, height: 1 };
                        setFraming({
                          ...framing,
                          crop: withAspect(framing.crop, option.ratio, picture),
                        });
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="hint">
                Drag inside the picture to move the crop, or a corner to resize it. What is
                greyed out is what goes.
              </p>
            </>
          )}

          <Slider
            label="Straighten"
            value={framing.angle}
            min={-MAX_ANGLE}
            max={MAX_ANGLE}
            step={0.1}
            onChange={(angle) => setFraming({ ...framing, angle })}
          />
          <span className="hint">
            {source
              ? `Finished size ${outputSize(source, framing).width} × ${
                  outputSize(source, framing).height
                }. `
              : ''}
            Straightening trims the corners rather than leaving them blank, so a heavy angle
            costs a little of the picture.
          </span>
        </fieldset>

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
            Download{ready && source
              ? ` · ${outputSize(source, framing).width} × ${outputSize(source, framing).height}`
              : ''}
          </button>
          <button
            className="btn"
            data-variant="quiet"
            disabled={untouched}
            onClick={() => {
              setAdjustments(neutralAdjustments());
              setFraming(neutralFraming());
              setAspect('free');
            }}
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

/**
 * The photograph straightened and cut to its crop, as a canvas.
 *
 * Two draws: the picture rotated into the box a rotated picture needs, then
 * the crop cut out of that. `maxEdge` caps the result for the live preview;
 * null renders at full size, which is what gets saved.
 */
function renderFramed(
  image: HTMLImageElement,
  framing: Framing,
  maxEdge: number | null,
): HTMLCanvasElement | null {
  const source = { width: image.width, height: image.height };
  const bounds = rotatedBounds(source, framing.angle);
  const rect = cropRect(source, framing);

  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(rect.width, rect.height)) : 1;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(rect.width * scale));
  out.height = Math.max(1, Math.round(rect.height * scale));
  const context = out.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.save();
  // Line the crop up with the canvas, then put the picture where it would be
  // inside the rotated box: one transform rather than an intermediate canvas
  // the size of the whole rotation.
  context.scale(scale, scale);
  context.translate(-rect.x, -rect.y);
  context.translate(bounds.width / 2, bounds.height / 2);
  context.rotate((framing.angle * Math.PI) / 180);
  context.drawImage(image, -source.width / 2, -source.height / 2);
  context.restore();
  return out;
}

/**
 * The crop box drawn over the picture: drag inside it to move it, drag a
 * corner to resize. Everything is in fractions of the picture, which is what
 * the box itself is measured in, so nothing here needs to know the size of
 * anything.
 */
function CropOverlay({ box, onBox }: { box: CropBox; onBox: (box: CropBox) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const from = useRef<{ x: number; y: number; box: CropBox; corner: string | null } | null>(null);

  const pointFrom = (event: React.PointerEvent) => {
    const area = ref.current?.getBoundingClientRect();
    if (!area || area.width === 0 || area.height === 0) return null;
    return {
      x: (event.clientX - area.left) / area.width,
      y: (event.clientY - area.top) / area.height,
    };
  };

  const start = (event: React.PointerEvent, corner: string | null) => {
    event.stopPropagation();
    const point = pointFrom(event);
    if (!point) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    from.current = { ...point, box, corner };
  };

  const move = (event: React.PointerEvent) => {
    const held = from.current;
    const point = pointFrom(event);
    if (!held || !point) return;
    const dx = point.x - held.x;
    const dy = point.y - held.y;

    if (held.corner === null) {
      onBox(clampBox({ ...held.box, x: held.box.x + dx, y: held.box.y + dy }));
      return;
    }
    const left = held.corner.includes('w');
    const top = held.corner.includes('n');
    const next = { ...held.box };
    if (left) {
      next.x = held.box.x + dx;
      next.width = held.box.width - dx;
    } else {
      next.width = held.box.width + dx;
    }
    if (top) {
      next.y = held.box.y + dy;
      next.height = held.box.height - dy;
    } else {
      next.height = held.box.height + dy;
    }
    // Dragged past the far edge, a corner would invert the box; the clamp
    // keeps it a rectangle with a size worth having.
    onBox(clampBox(next));
  };

  const end = () => {
    from.current = null;
  };

  const style = {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  };

  return (
    <div
      ref={ref}
      className="ed-crop"
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="ed-crop-box" style={style} onPointerDown={(event) => start(event, null)}>
        {['nw', 'ne', 'sw', 'se'].map((corner) => (
          <span
            key={corner}
            className="ed-crop-grip"
            data-corner={corner}
            onPointerDown={(event) => start(event, corner)}
          />
        ))}
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
