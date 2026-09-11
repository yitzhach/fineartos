import { useState } from 'react';
import type { CommissionDocument } from '../types';

interface Props {
  doc: CommissionDocument;
  imageUrls: Record<string, string>;
  onChange: (changes: Partial<CommissionDocument>) => void;
}

/**
 * The inspector down the right of a project window: the current image, its
 * facts, and a place for a quick note.
 *
 * The facts are the document's own fields, editable in place — not a second
 * copy of them. "Not set" where a value is missing, never a dash that could
 * be read as a measurement.
 *
 * Hidden on a phone by the caller: a third column on a 390px screen is not
 * an inspector, it is a squeeze.
 */
export function ArtworkInspector({ doc, imageUrls, onChange }: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const imageId = doc.artwork.referenceImageIds[0];
  const url = imageId ? imageUrls[imageId] : undefined;
  const count = doc.artwork.referenceImageIds.length;

  return (
    <aside className="inspector" aria-label="Artwork details">
      <h3>Artwork details</h3>

      <div className="insp-image">
        {url ? <img src={url} alt="" /> : <span className="sheet-face" aria-hidden="true" />}
      </div>

      <p className="insp-file">
        {count === 0
          ? 'No image yet'
          : `${count} ${count === 1 ? 'image' : 'images'} on this device`}
      </p>

      <dl className="insp-facts">
        <Row label="Dimensions" value={dimensions(doc)} />
        <Row label="Medium" value={doc.artwork.materials} />
        <Row label="Finish" value={doc.artwork.finish} />
        <Row label="Location" value={doc.client.projectAddress} />
        <Row label="Status" value={doc.state === 'issued' ? 'Issued' : 'Draft'} />
      </dl>

      <h3>
        Quick note
        <button className="btn" data-variant="quiet" onClick={() => setNoteOpen(!noteOpen)}>
          {noteOpen ? 'Done' : 'Edit'}
        </button>
      </h3>
      {noteOpen ? (
        <textarea
          aria-label="Quick note"
          value={doc.privateNotes ?? ''}
          onChange={(e) => onChange({ privateNotes: e.target.value || null })}
        />
      ) : (
        <p className="insp-note">
          {doc.privateNotes?.trim() || 'Nothing noted. These notes never reach the client.'}
        </p>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  const shown = value?.trim();
  return (
    <div>
      <dt>{label}</dt>
      <dd className={shown ? '' : 'unset'}>{shown || 'Not set'}</dd>
    </div>
  );
}

function dimensions(doc: CommissionDocument): string | null {
  const { width, height, unit } = doc.artwork;
  if (width === null || height === null) return null;
  return `${width} × ${height} ${unit}`;
}
