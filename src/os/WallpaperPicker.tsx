import {
  BUNDLED_WALLPAPERS,
  type WallpaperChoice,
} from '../lib/prefs';
import { describeSize, type CustomWallpaper, type WallpaperFit } from '../lib/wallpapers';
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
