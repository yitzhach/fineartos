import {
  BUNDLED_WALLPAPERS,
  type WallpaperChoice,
} from '../lib/prefs';
import { describeSize, type CustomWallpaper, type WallpaperFit } from '../lib/wallpapers';
import {
  DEFAULT_CROSSFADE_SECONDS,
  MAX_CROSSFADE_SECONDS,
  MAX_SECONDS,
  MIN_CROSSFADE_SECONDS,
  MAX_SLIDES,
  MIN_SECONDS,
  emptySlideshow,
  isFull,
  readySlides,
  slideshowProblem,
  timingNote,
  toggleSlide,
  type Slideshow,
} from '../lib/slideshow';
import { SHIPPED_PHOTOGRAPHS, describeBytes, isPhotographKey } from '../lib/photographs';
import { ImageDrop } from './ImageDrop';

interface Props {
  wallpaper: WallpaperChoice;
  onWallpaper: (value: WallpaperChoice) => void;
  library: CustomWallpaper[];
  /** Object URLs for the artist's own pictures, by image id. */
  customUrls: Record<string, string>;
  onUpload: (files: File[]) => void;
  onRemove: (imageId: string) => void;
  onRename: (imageId: string, name: string) => void;
  busy: boolean;
  error: string | null;
}

const FITS: { id: WallpaperFit; label: string; hint: string }[] = [
  { id: 'cover', label: 'Fill', hint: 'Crops to fill the screen' },
  { id: 'contain', label: 'Fit', hint: 'Shows the whole picture' },
  { id: 'centre', label: 'Centre', hint: 'Actual size, centred' },
];

/**
 * The desktop picture picker: the bundled pictures, the artist's own, and the
 * controls that make a photograph usable as a background.
 *
 * Fit and dim exist because a real photograph is not a designed background. A
 * bright one makes white icon labels unreadable, and a portrait one cropped to
 * fill loses its subject. Both are one control away rather than something the
 * artist has to go and edit the picture to fix.
 */
export function WallpaperPicker(props: Props) {
  const { wallpaper, library, customUrls } = props;
  const fit = wallpaper.fit ?? 'cover';
  const dim = wallpaper.dim ?? 0;
  const showsPicture = wallpaper.id !== 'solid';

  const show: Slideshow = wallpaper.slideshow ?? emptySlideshow();
  /**
   * What a slide can be: one of the artist's own pictures, or one of the
   * photographs that ship with the app. A slide is keyed by the image id or
   * by the file's path, which is what the desktop resolves back to a picture.
   */
  const slideChoices = [
    ...library.map((item) => ({
      key: item.imageId,
      name: item.name,
      url: customUrls[item.imageId],
    })),
    ...SHIPPED_PHOTOGRAPHS.map((photograph) => ({
      key: photograph.src,
      name: photograph.name,
      url: photograph.thumb,
    })),
  ];
  const ready = readySlides(show, slideChoices.map((item) => item.key));
  const problem = slideshowProblem(show, slideChoices.length);
  const running = wallpaper.id === 'slideshow';
  const setShow = (next: Slideshow) => props.onWallpaper({ ...wallpaper, slideshow: next });

  return (
    <div className="wp">
      <h4>Bundled</h4>
      <div className="wp-grid">
        {BUNDLED_WALLPAPERS.map((option) => (
          <button
            key={option.id}
            className="wp-tile"
            data-selected={wallpaper.id === option.id}
            onClick={() => props.onWallpaper({ ...wallpaper, id: option.id })}
          >
            <img src={option.src} alt="" />
            <span className="wp-name">{option.name}</span>
          </button>
        ))}

        <button
          className="wp-tile"
          data-selected={wallpaper.id === 'solid'}
          onClick={() => props.onWallpaper({ ...wallpaper, id: 'solid' })}
        >
          <span className="wp-solid" aria-hidden="true" />
          <span className="wp-name">Solid colour</span>
        </button>
      </div>

      {SHIPPED_PHOTOGRAPHS.length > 0 && (
        <>
          <h4>
            Photographs
            <span className="wp-count">{SHIPPED_PHOTOGRAPHS.length}</span>
          </h4>
          <p className="hint">
            Shipped with the app. Each one is downloaded the first time it is used, and kept
            after that — so picking one costs its size once.
          </p>
          <div className="wp-grid">
            {SHIPPED_PHOTOGRAPHS.map((option) => {
              const selected = wallpaper.id === 'photograph' && wallpaper.photographSrc === option.src;
              return (
                <button
                  key={option.src}
                  className="wp-tile"
                  data-selected={selected}
                  onClick={() =>
                    props.onWallpaper({ ...wallpaper, id: 'photograph', photographSrc: option.src })
                  }
                >
                  <img src={option.thumb} alt="" loading="lazy" />
                  <span className="wp-name">{option.name}</span>
                  <span className="wp-meta">
                    {describeSize(option.width, option.height)} · {describeBytes(option.bytes)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <h4>
        Your pictures
        {library.length > 0 && <span className="wp-count">{library.length}</span>}
      </h4>

      {library.length > 0 && (
        <div className="wp-grid">
          {library.map((item) => {
            const selected = wallpaper.id === 'custom' && wallpaper.customImageId === item.imageId;
            return (
              <div key={item.imageId} className="wp-own">
                <button
                  className="wp-tile"
                  data-selected={selected}
                  onClick={() =>
                    props.onWallpaper({ ...wallpaper, id: 'custom', customImageId: item.imageId })
                  }
                >
                  {customUrls[item.imageId] ? (
                    <img src={customUrls[item.imageId]} alt="" />
                  ) : (
                    <span className="wp-solid" aria-hidden="true" />
                  )}
                  <span className="wp-name">{item.name}</span>
                  <span className="wp-meta">{describeSize(item.width, item.height)}</span>
                </button>

                <button
                  className="wp-remove"
                  aria-label={`Remove ${item.name}`}
                  title="Remove this picture"
                  onClick={() => props.onRemove(item.imageId)}
                >
                  ✕
                </button>

                <input
                  className="wp-rename"
                  aria-label={`Rename ${item.name}`}
                  value={item.name}
                  onChange={(e) => props.onRename(item.imageId, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <ImageDrop
          multiple
          onFiles={props.onUpload}
          error={props.error}
          label={props.busy ? 'Adding…' : 'Drop pictures here to use as your desktop'}
          hint="or click to choose · several at once is fine · they stay on this device"
        />
        <span className="hint">
          Large photographs are resized to 2560px on the longest edge and saved as JPEG, so
          the app stays quick. The original file on your computer is not touched.
        </span>
      </div>

      <h4>Slideshow</h4>
      <p className="hint">
        Up to {MAX_SLIDES} of your own pictures, one after another. Tap the ones you want, in
        the order you want them.
      </p>

      {slideChoices.length === 0 ? (
        <p className="hint">Nothing to show yet — add some pictures below first.</p>
      ) : (
        <div className="wp-grid">
          {slideChoices.map((item) => {
            const at = show.imageIds.indexOf(item.key);
            const picked = at >= 0;
            return (
              <button
                key={item.key}
                className="wp-tile"
                data-selected={picked}
                aria-pressed={picked}
                disabled={!picked && isFull(show)}
                title={
                  picked
                    ? `Take ${item.name} out of the slideshow`
                    : isFull(show)
                      ? `That is ${MAX_SLIDES} pictures — take one out to add another`
                      : `Add ${item.name} to the slideshow`
                }
                onClick={() => setShow(toggleSlide(show, item.key))}
              >
                {item.url ? (
                  <img src={item.url} alt="" loading="lazy" />
                ) : (
                  <span className="wp-solid" aria-hidden="true" />
                )}
                <span className="wp-name">{item.name}</span>
                {picked && <span className="wp-order" aria-hidden="true">{at + 1}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="field" style={{ marginTop: 10 }}>
        <label>Timing</label>
        <div className="chip-row">
          <button
            className="btn"
            data-variant={show.timing === 'each' ? 'primary' : 'quiet'}
            aria-pressed={show.timing === 'each'}
            onClick={() => setShow({ ...show, timing: 'each' })}
          >
            Seconds on each
          </button>
          <button
            className="btn"
            data-variant={show.timing === 'loop' ? 'primary' : 'quiet'}
            aria-pressed={show.timing === 'loop'}
            onClick={() => setShow({ ...show, timing: 'loop' })}
          >
            Seconds for the whole loop
          </button>
          <input
            className="wp-seconds"
            id="wp-seconds"
            type="number"
            min={MIN_SECONDS}
            max={MAX_SECONDS}
            step={1}
            value={show.seconds}
            aria-label={
              show.timing === 'each' ? 'Seconds on each picture' : 'Seconds for the whole loop'
            }
            onChange={(e) => {
              const seconds = Number(e.target.value);
              if (Number.isFinite(seconds)) setShow({ ...show, seconds });
            }}
          />
        </div>
        <span className="hint">{timingNote(show, ready.length)}</span>
      </div>

      <div className="field">
        <label htmlFor="wp-crossfade">Crossfade</label>
        <div className="chip-row">
          <input
            className="wp-seconds"
            id="wp-crossfade"
            type="number"
            min={MIN_CROSSFADE_SECONDS}
            max={MAX_CROSSFADE_SECONDS}
            step={0.1}
            value={show.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS}
            aria-label="Seconds of crossfade between pictures"
            onChange={(e) => {
              const crossfade = Number(e.target.value);
              if (Number.isFinite(crossfade)) setShow({ ...show, crossfadeSeconds: crossfade });
            }}
          />
          <span className="hint">
            seconds to dissolve from one picture to the next. 0 cuts straight over.
          </span>
        </div>
      </div>

      <div className="chip-row">
        <button
          className="btn"
          data-variant={running ? 'quiet' : 'primary'}
          disabled={!running && Boolean(problem)}
          onClick={() =>
            props.onWallpaper({
              ...wallpaper,
              slideshow: show,
              // Stopping goes back to a still picture rather than to nothing:
              // whichever of the set is first, or the bundled default.
              ...(running ? stillPictureFrom(show.imageIds[0], wallpaper) : { id: 'slideshow' as const }),
            })
          }
        >
          {running ? 'Stop the slideshow' : 'Use the slideshow'}
        </button>
        {show.imageIds.length > 0 && (
          <button
            className="btn"
            data-variant="quiet"
            onClick={() => setShow({ ...show, imageIds: [] })}
          >
            Clear the picks
          </button>
        )}
      </div>
      {problem && <p className="hint">{problem}</p>}
      {running && ready.length < show.imageIds.length && (
        <p className="hint">
          {show.imageIds.length - ready.length} of the pictures picked have been deleted from the
          library; the slideshow skips them.
        </p>
      )}

      {showsPicture && (
        <fieldset className="section" style={{ marginTop: 16 }}>
          <legend>How it sits</legend>

          <div className="field">
            <label>Fit</label>
            <div className="chip-row">
              {FITS.map((option) => (
                <button
                  key={option.id}
                  className="btn"
                  data-variant={fit === option.id ? 'primary' : 'quiet'}
                  aria-pressed={fit === option.id}
                  title={option.hint}
                  onClick={() => props.onWallpaper({ ...wallpaper, fit: option.id })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="hint">{FITS.find((f) => f.id === fit)?.hint}</span>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={wallpaper.monochrome === true}
              onChange={(e) => props.onWallpaper({ ...wallpaper, monochrome: e.target.checked })}
            />
            <span>Black and white</span>
          </label>
          <span className="hint">
            Greys the desktop picture only — the windows, the icons and the dock keep their
            colour, and the picture itself is not changed. Works on a slideshow too.
          </span>

          <div className="field">
            <label htmlFor="wp-dim">Dim the picture — {dim}%</label>
            <input
              id="wp-dim"
              type="range"
              min={0}
              max={70}
              step={5}
              value={dim}
              onChange={(e) => props.onWallpaper({ ...wallpaper, dim: Number(e.target.value) })}
            />
            <span className="hint">
              Darkens the background only. Use it when a bright picture makes the icon
              labels hard to read.
            </span>
          </div>
        </fieldset>
      )}
    </div>
  );
}


/**
 * What the desktop goes back to when the slideshow is stopped: the first
 * picture of the set, still, rather than nothing at all. A set that has been
 * emptied falls back to a bundled picture, which is always there.
 */
function stillPictureFrom(
  key: string | undefined,
  wallpaper: WallpaperChoice,
): Pick<WallpaperChoice, 'id' | 'customImageId' | 'photographSrc'> {
  if (key === undefined) {
    return { id: 'obsidian', customImageId: wallpaper.customImageId };
  }
  if (isPhotographKey(key)) {
    return { id: 'photograph', customImageId: wallpaper.customImageId, photographSrc: key };
  }
  return { id: 'custom', customImageId: key, photographSrc: wallpaper.photographSrc ?? null };
}
