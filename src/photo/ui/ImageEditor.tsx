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

/** The longest edge the finished preview is worked at. */
const PREVIEW_EDGE = 1400;

/**
 * The longest edge used *while a control is moving*.
 *
 * The pipeline is per-pixel JavaScript, so its cost is the pixel count: a
 * 1400px preview is around 1.5 million of them, which is too many to redo
 * sixty times a second. Dragging works on a quarter-size copy — a fifth of
 * the pixels — drawn scaled up, and the full-size pass runs once the control
 * settles. The difference is invisible on a moving slider and obvious in how
 * quickly the picture answers.
 */
const FAST_EDGE = 620;

/** How long after the last move the full-size pass runs. */
const SETTLE_MS = 140;

/** Which set of tools is open. One at a time, phone or desktop. */
type ToolGroup = 'crop' | 'light' | 'colour' | 'mix' | 'save';

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
   * The tools on show. One group at a time, the way a phone editor works:
   * the picture keeps the screen and the panel under it changes. Cropping
   * follows from it — the crop group *is* crop mode, because the whole
   * straightened picture has to be visible to choose what to cut off.
   */
  const [openGroup, setOpenGroup] = useState<ToolGroup | null>(null);
  const cropping = openGroup === 'crop';
  const [aspect, setAspect] = useState<string>('free');
  const [band, setBand] = useState<BandName>('yellow');
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /**
   * Everything the drawing needs, at both sizes: the picture as it came in
   * (never written to), a buffer the pipeline writes into, and a small canvas
   * to blit the quarter-size pass from. Built once per frame change.
   */
  const baseRef = useRef<{
    full: ImageData;
    fullOut: ImageData;
    fast: ImageData;
    fastOut: ImageData;
    fastCanvas: HTMLCanvasElement;
  } | null>(null);
  const frameRef = useRef<number | null>(null);
  /** The adjustments a queued frame should draw — a ref, so it is never stale. */
  const pendingRef = useRef<Adjustments>(adjustments);
  /** Whether that frame should be the quick pass. */
  const pendingFastRef = useRef(false);
  /** True while a control is being moved, cleared once it settles. */
  const movingRef = useRef(false);
  const settleRef = useRef<number | null>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  /** Bumped when the photograph has loaded, to rebuild what is drawn from it. */
  const [loaded, setLoaded] = useState(0);
  /**
   * The shape of what is on the canvas. The plate is given this as an
   * aspect-ratio so it fits inside whatever room is left without
   * letterboxing: the canvas fills the plate exactly, which is what keeps the
   * crop overlay lined up with the picture rather than with a padded box.
   */
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);

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
  /** A dot on any group holding a change, so nothing hides behind a label. */
  const touchedGroups = useMemo(() => {
    const touched = new Set<ToolGroup>();
    if (isFramed(framing)) touched.add('crop');
    if (
      adjustments.exposure !== 0 ||
      adjustments.contrast !== 0 ||
      adjustments.highlights !== 0 ||
      adjustments.shadows !== 0 ||
      adjustments.blackPoint !== 0 ||
      adjustments.whitePoint !== 0 ||
      adjustments.gamma !== 1
    ) {
      touched.add('light');
    }
    if (
      adjustments.temperature !== 0 ||
      adjustments.saturation !== 0 ||
      adjustments.hue !== 0 ||
      adjustments.blackAndWhite
    ) {
      touched.add('colour');
    }
    if (
      BAND_NAMES.some((name) => {
        const one = adjustments.bands[name];
        return one.hue !== 0 || one.saturation !== 0 || one.luminance !== 0;
      })
    ) {
      touched.add('mix');
    }
    return touched;
  }, [adjustments, framing]);
  const allChanges = [...framingChanges, ...changes];

  /**
   * Paints the canvas. `'photograph'` is the picture with nothing applied,
   * which is a straight blit rather than a run of the pipeline over settings
   * that do nothing — that is what makes Hold to compare answer at once.
   */
  const draw = useCallback((settings: Adjustments | 'photograph', fast: boolean) => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    if (settings === 'photograph') {
      context.putImageData(base.full, 0, 0);
      return;
    }
    if (fast) {
      applyAdjustments(base.fast.data, settings, base.fastOut.data);
      const small = base.fastCanvas.getContext('2d');
      if (!small) return;
      small.putImageData(base.fastOut, 0, 0);
      context.drawImage(base.fastCanvas, 0, 0, canvas.width, canvas.height);
      return;
    }
    applyAdjustments(base.full.data, settings, base.fullOut.data);
    context.putImageData(base.fullOut, 0, 0);
  }, []);

  /** One paint per animation frame, whatever the sliders are doing. */
  const schedule = useCallback(
    (fast: boolean) => {
      pendingFastRef.current = fast;
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        draw(pendingRef.current, pendingFastRef.current);
      });
    },
    [draw],
  );

  /**
   * Called by every control as it moves: draw quickly now, properly in a
   * moment. Without it a slider would drag against a full-size repaint and
   * feel like it was being pulled through treacle.
   */
  const touching = useCallback(() => {
    movingRef.current = true;
    if (settleRef.current !== null) clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null;
      movingRef.current = false;
      schedule(false);
    }, SETTLE_MS);
  }, [schedule]);

  useEffect(
    () => () => {
      if (settleRef.current !== null) clearTimeout(settleRef.current);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

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
  /**
   * What the base depends on. In crop mode the base is the whole straightened
   * picture, so the crop box itself does not come into it — which is what
   * stops dragging the box rebuilding and re-rendering the picture on every
   * pointer move.
   */
  const frameKey = cropping
    ? `crop:${framing.angle}`
    : `${framing.angle}:${framing.crop.x}:${framing.crop.y}:${framing.crop.width}:${framing.crop.height}`;

  useEffect(() => {
    const image = sourceRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const wanted = cropping ? { angle: framing.angle, crop: { ...FULL_CROP } } : framing;

    const full = renderFramed(image, wanted, PREVIEW_EDGE);
    const fast = renderFramed(image, wanted, FAST_EDGE);
    const fullContext = full?.getContext('2d', { willReadFrequently: true });
    const fastContext = fast?.getContext('2d', { willReadFrequently: true });
    if (!full || !fast || !fullContext || !fastContext) {
      setProblem('This browser did not provide a 2D canvas to work in.');
      return;
    }

    canvas.width = full.width;
    canvas.height = full.height;
    baseRef.current = {
      full: fullContext.getImageData(0, 0, full.width, full.height),
      fullOut: fullContext.createImageData(full.width, full.height),
      fast: fastContext.getImageData(0, 0, fast.width, fast.height),
      fastOut: fastContext.createImageData(fast.width, fast.height),
      fastCanvas: fast,
    };
    setBaseSize({ width: full.width, height: full.height });
    setReady(true);
    // Painted here rather than left to the effect below: rebuilding the base
    // sets no state that effect watches, and the canvas would otherwise sit
    // showing the picture without its adjustments.
    draw(pendingRef.current, movingRef.current);
    // `frameKey` stands in for the framing: see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropping, draw, frameKey, loaded]);


  useEffect(() => {
    // Kept current even before the picture has loaded, because that is what
    // the loader paints with the moment it has something to paint on.
    pendingRef.current = adjustments;
    if (!ready) return;
    // Comparing is a blit of the photograph, so it never waits for the
    // pipeline; everything else draws quickly while a control is moving.
    if (compare) draw('photograph', false);
    else schedule(movingRef.current);
  }, [adjustments, compare, draw, ready, schedule]);

  const set = (changed: Partial<Adjustments>) => {
    touching();
    setAdjustments((current) => ({ ...current, ...changed }));
  };
  const setBandValue = (name: BandName, changed: Partial<Adjustments['bands'][BandName]>) => {
    touching();
    setAdjustments((current) => ({
      ...current,
      bands: { ...current.bands, [name]: { ...current.bands[name], ...changed } },
    }));
  };
  /** Straightening rebuilds the base, so it wants the same quick pass. */
  const setFramingLive = (next: Framing) => {
    touching();
    setFraming(next);
  };

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
  const openLabel = GROUPS.find((group) => group.id === openGroup)?.label ?? '';

  return (
    <div className="ed" data-panel={openGroup ?? 'none'}>
      <div className="ed-stage">
        <div className="ed-frame">
          <div
            className="ed-plate"
            style={baseSize ? { aspectRatio: `${baseSize.width} / ${baseSize.height}` } : undefined}
          >
            <canvas ref={canvasRef} className="ed-canvas" />
            {cropping && (
              <CropOverlay box={framing.crop} onBox={(crop) => setFraming({ ...framing, crop })} />
            )}
          </div>
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

      {/* One set of tools at a time, the way a phone editor works: the picture
          keeps the room, and the panel is what changes. Scrolling to reach a
          slider and losing sight of what it is doing is the thing to avoid. */}
      <div className="ed-tools">
        <div className="ed-groups" role="tablist" aria-label="Editing tools">
          {GROUPS.map((group) => (
            <button
              key={group.id}
              className="ed-group"
              role="tab"
              aria-selected={openGroup === group.id}
              data-active={openGroup === group.id}
              data-touched={touchedGroups.has(group.id)}
              disabled={!ready && group.id !== 'save'}
              onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
            >
              <span className="ed-group-mark" aria-hidden="true">{group.mark}</span>
              {group.label}
            </button>
          ))}
        </div>

        {openGroup && (
          <div className="ed-panel" role="tabpanel" aria-label={openLabel}>
            <div className="ed-panel-head">
              <strong>{openLabel}</strong>
              <button className="btn" data-variant="quiet" onClick={() => setOpenGroup(null)}>
                Done
              </button>
            </div>

            {openGroup === 'crop' && (
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
                <Slider
                  label="Straighten"
                  value={framing.angle}
                  min={-MAX_ANGLE}
                  max={MAX_ANGLE}
                  step={0.1}
                  onChange={(angle) => setFramingLive({ ...framing, angle })}
                />
                <div className="chip-row">
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
                  <span className="hint">
                    {source
                      ? `Finished size ${outputSize(source, framing).width} × ${
                          outputSize(source, framing).height
                        }.`
                      : ''}
                  </span>
                </div>
                <span className="hint">
                  Drag inside the picture to move the crop, or a corner to resize it. What is
                  greyed out is what goes. Straightening trims the corners rather than leaving
                  them blank, so a heavy angle costs a little of the picture.
                </span>
              </>
            )}

            {openGroup === 'light' && (
              <>
                <Slider label="Exposure" value={adjustments.exposure} onChange={(v) => set({ exposure: v })} />
                <Slider label="Contrast" value={adjustments.contrast} onChange={(v) => set({ contrast: v })} />
                <Slider label="Highlights" value={adjustments.highlights} onChange={(v) => set({ highlights: v })} />
                <Slider label="Shadows" value={adjustments.shadows} onChange={(v) => set({ shadows: v })} />
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
              </>
            )}

            {openGroup === 'colour' && (
              <>
                <Slider
                  label="Temperature"
                  value={adjustments.temperature}
                  onChange={(v) => set({ temperature: v })}
                />
                <Slider
                  label="Saturation"
                  value={adjustments.saturation}
                  onChange={(v) => set({ saturation: v })}
                />
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
                  Applied last, so Mix works as a channel mixer — dropping the blues darkens a
                  sky.
                </span>
              </>
            )}

            {openGroup === 'mix' && (
              <>
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
                <span className="hint">
                  Only pixels near the chosen hue change, and greys are left alone — so the
                  yellows can go to red without the whole picture turning.
                </span>
              </>
            )}

            {openGroup === 'save' && (
              <>
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
                    Download
                    {ready && source
                      ? ` · ${outputSize(source, framing).width} × ${
                          outputSize(source, framing).height
                        }`
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
                  Save the edit changes what the studio shows and keeps the photograph underneath
                  it, so this can be reopened and changed — or put back — at any point. Save as a
                  new picture leaves this one alone and adds a second. Download writes a JPEG at
                  the size above.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The tool groups, in the order they are worked in. */
const GROUPS: { id: ToolGroup; label: string; mark: string }[] = [
  { id: 'crop', label: 'Crop', mark: '⌗' },
  { id: 'light', label: 'Light', mark: '◐' },
  { id: 'colour', label: 'Colour', mark: '◑' },
  { id: 'mix', label: 'Mix', mark: '◍' },
  { id: 'save', label: 'Save', mark: '↧' },
];

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
