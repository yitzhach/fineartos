import { describePrice, describeSize, type Photo } from '../photo';

interface Props {
  photo: Photo;
  url: string | undefined;
  onChange: (changes: Partial<Photo>) => void;
  onSend: () => void;
}

/**
 * A picture, full size, with the details a buyer asks for underneath.
 *
 * Every field can be left empty. What is empty stays empty: an unmeasured
 * work says "not recorded" rather than showing a zero, and a piece with no
 * price reads "Price on request" — which is a real answer at a show, and a
 * good deal better than implying it is free.
 */
export function PhotoWindow({ photo, url, onChange, onSend }: Props) {
  const size = describeSize(photo);

  return (
    <div className="photo-window">
      <figure className="photo-plate">
        {url ? (
          <img src={url} alt={photo.title} />
        ) : (
          <div className="photo-missing">This picture is still loading.</div>
        )}
        <figcaption>
          <strong>{photo.title}</strong>
          <span>
            {size ?? 'Size not recorded'} · {describePrice(photo)}
          </span>
        </figcaption>
      </figure>

      <div className="photo-details">
        <div className="field">
          <label htmlFor={`title-${photo.id}`}>Title</label>
          <input
            id={`title-${photo.id}`}
            value={photo.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={`w-${photo.id}`}>Width (in)</label>
            <input
              id={`w-${photo.id}`}
              type="number"
              min="0"
              step="0.25"
              value={photo.widthIn ?? ''}
              placeholder="Not recorded"
              onChange={(e) => onChange({ widthIn: numberOrNull(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor={`h-${photo.id}`}>Height (in)</label>
            <input
              id={`h-${photo.id}`}
              type="number"
              min="0"
              step="0.25"
              value={photo.heightIn ?? ''}
              placeholder="Not recorded"
              onChange={(e) => onChange({ heightIn: numberOrNull(e.target.value) })}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={`m-${photo.id}`}>Medium</label>
            <input
              id={`m-${photo.id}`}
              value={photo.medium ?? ''}
              placeholder="Oil on linen"
              onChange={(e) => onChange({ medium: e.target.value || null })}
            />
          </div>
          <div className="field">
            <label htmlFor={`y-${photo.id}`}>Year</label>
            <input
              id={`y-${photo.id}`}
              type="number"
              value={photo.year ?? ''}
              placeholder="—"
              onChange={(e) => onChange({ year: numberOrNull(e.target.value) })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`p-${photo.id}`}>Price</label>
          <input
            id={`p-${photo.id}`}
            type="number"
            min="0"
            step="1"
            value={photo.price ?? ''}
            placeholder="Leave blank for price on request"
            onChange={(e) => onChange({ price: numberOrNull(e.target.value) })}
          />
          <span className="hint">Blank is not zero — it reads “Price on request”.</span>
        </div>

        <div className="field">
          <label htmlFor={`n-${photo.id}`}>Note</label>
          <textarea
            id={`n-${photo.id}`}
            rows={3}
            value={photo.note ?? ''}
            placeholder="Anything you want to say about this piece"
            onChange={(e) => onChange({ note: e.target.value || null })}
          />
        </div>

        <button className="btn" data-variant="primary" onClick={onSend}>
          Send to a client
        </button>
      </div>
    </div>
  );
}

/** An empty box means not recorded, which is null — never 0. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
