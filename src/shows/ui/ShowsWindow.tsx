import { useEffect, useRef, useState } from 'react';
import { formatMoney, parseMoney } from '../../commission/calc';
import type { GuestEntry } from '../../connect/guestbook';
import type { Photo } from '../../photo/photo';
import {
  SHOW_STATUSES,
  boothFees,
  createShow,
  deadlinesAhead,
  describeDates,
  describeStatus,
  editShow,
  guestsAt,
  localToday,
  showProblem,
  whenIs,
  type Show,
  type ShowStatus,
} from '../shows';

interface Props {
  shows: Show[];
  photos: Photo[];
  imageUrls: Record<string, string>;
  guests: GuestEntry[];
  currency: string;
  onSave: (show: Show) => void;
  onTrash: (show: Show) => void;
  onTogglePiece: (show: Show, photo: Photo) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

const WHEN_LABEL = { upcoming: 'Upcoming', on: 'On now', past: 'Past', undated: 'No date' } as const;

/**
 * Shows: the event. Which pieces went is listed here; where each piece is
 * lives on the piece, in Artwork. A booth fee lands in the books once the
 * artist is accepted — the books row is written by the app, not here.
 */
export function ShowsWindow({ shows, photos, imageUrls, guests, currency, onSave, onTrash, onTogglePiece, onExport, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const today = localToday();
  const [selectedId, setSelectedId] = useState<string | null>(shows[0]?.id ?? null);
  const [newName, setNewName] = useState('');
  const selected = shows.find((show) => show.id === selectedId) ?? null;
  const fees = boothFees(shows.filter((show) => show.status === 'accepted' || show.status === 'done'));
  const ahead = deadlinesAhead(shows, today);

  const add = () => {
    const show = createShow(newName);
    if (showProblem(show)) return;
    onSave(show);
    setSelectedId(show.id);
    setNewName('');
  };

  return (
    <div className="sh-window">
      <div className="sh-bar">
        <form
          className="sh-new"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            aria-label="New show name"
            type="text"
            placeholder="Name of a show"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn" data-variant="primary" type="submit" disabled={!newName.trim()}>
            Add show
          </button>
        </form>
        <div className="chip-row">
          <button className="btn" data-variant="quiet" onClick={onExport}>
            Save shows as a file
          </button>
          <button className="btn" data-variant="quiet" onClick={() => fileRef.current?.click()}>
            Read a shows file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = '';
            }}
          />
        </div>
        <p className="hint">
          Booth fees, accepted and done: {formatMoney(fees.total, currency)}
          {fees.notRecorded > 0 ? ` · ${fees.notRecorded} with no fee recorded, left out` : ''}
          {ahead[0] ? ` · Next deadline: ${ahead[0].name}, ${ahead[0].deadline}` : ''}
        </p>
      </div>

      <div className="sh-body">
        <ul className="sh-list">
          {shows.length === 0 && <li className="hint">No shows yet. Add one above.</li>}
          {shows.map((show) => (
            <li key={show.id}>
              <button aria-current={show.id === selectedId} onClick={() => setSelectedId(show.id)}>
                <strong>{show.name}</strong>
                <span className="faint">
                  {describeDates(show) ?? 'No date'} · {describeStatus(show.status)}
                </span>
                <span className="faint">{WHEN_LABEL[whenIs(show, today)]}</span>
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <ShowDetail
            key={selected.id}
            show={selected}
            photos={photos}
            imageUrls={imageUrls}
            guests={guestsAt(selected, guests)}
            currency={currency}
            onSave={onSave}
            onTrash={(show) => {
              onTrash(show);
              setSelectedId(null);
            }}
            onTogglePiece={onTogglePiece}
          />
        ) : (
          <p className="hint sh-empty">Pick a show to see it.</p>
        )}
      </div>
    </div>
  );
}

function ShowDetail({
  show,
  photos,
  imageUrls,
  guests,
  currency,
  onSave,
  onTrash,
  onTogglePiece,
}: {
  show: Show;
  photos: Photo[];
  imageUrls: Record<string, string>;
  guests: GuestEntry[];
  currency: string;
  onSave: (show: Show) => void;
  onTrash: (show: Show) => void;
  onTogglePiece: (show: Show, photo: Photo) => void;
}) {
  // A local copy, so a half-typed date or a backwards range is shown with
  // its problem instead of being saved.
  const [draft, setDraft] = useState(show);
  const [fee, setFee] = useState(show.boothFee === null ? '' : String(show.boothFee / 100));
  useEffect(() => setDraft(show), [show]);
  const problem = showProblem(draft);

  const change = (changes: Partial<Show>) => {
    const next = editShow(draft, changes);
    setDraft(next);
    if (!showProblem(next)) onSave(next);
  };

  return (
    <section className="sh-detail">
      <div className="field">
        <label htmlFor="sh-name">Name</label>
        <input id="sh-name" type="text" value={draft.name} onChange={(e) => change({ name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="sh-venue">Venue</label>
        <input
          id="sh-venue"
          type="text"
          value={draft.venue ?? ''}
          onChange={(e) => change({ venue: e.target.value || null })}
        />
      </div>
      <div className="sh-row">
        <div className="field">
          <label htmlFor="sh-start">Starts</label>
          <input
            id="sh-start"
            type="date"
            value={draft.startDate ?? ''}
            onChange={(e) => change({ startDate: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="sh-end">Ends</label>
          <input
            id="sh-end"
            type="date"
            value={draft.endDate ?? ''}
            onChange={(e) => change({ endDate: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="sh-deadline">Deadline</label>
          <input
            id="sh-deadline"
            type="date"
            value={draft.deadline ?? ''}
            onChange={(e) => change({ deadline: e.target.value || null })}
          />
        </div>
      </div>
      <div className="sh-row">
        <div className="field">
          <label htmlFor="sh-status">Status</label>
          <select
            id="sh-status"
            value={draft.status ?? ''}
            onChange={(e) => change({ status: (e.target.value || null) as ShowStatus | null })}
          >
            <option value="">Not said</option>
            {SHOW_STATUSES.map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sh-fee">Booth fee ({currency})</label>
          <input
            id="sh-fee"
            type="text"
            inputMode="decimal"
            placeholder="Not recorded"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            onBlur={() => change({ boothFee: parseMoney(fee) })}
          />
        </div>
      </div>
      <p className="hint">
        {draft.status === 'accepted' || draft.status === 'done'
          ? `In the books under Show fees: ${formatMoney(draft.boothFee, currency)}.`
          : 'The booth fee goes into the books once the status is Accepted or Done.'}
      </p>
      {problem && (
        <p className="sh-problem" role="alert">
          {problem} Not saved until fixed.
        </p>
      )}

      <div className="field">
        <label htmlFor="sh-note">Note</label>
        <textarea id="sh-note" rows={2} value={draft.note ?? ''} onChange={(e) => change({ note: e.target.value || null })} />
      </div>

      <h4>Pieces taken ({draft.pieceIds.length})</h4>
      {photos.length === 0 ? (
        <p className="hint">No pieces in the studio yet.</p>
      ) : (
        <>
          <p className="hint">Tap to take a piece. It reads "At a show" in Artwork until taken off.</p>
          <div className="sh-pieces">
            {photos.map((photo) => (
              <button
                key={photo.id}
                className="sh-piece"
                aria-pressed={draft.pieceIds.includes(photo.id)}
                onClick={() => onTogglePiece(draft, photo)}
                disabled={problem !== null}
              >
                {imageUrls[photo.imageId] ? <img src={imageUrls[photo.imageId]} alt="" /> : <span className="missing" />}
                <span className="cap">{photo.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h4>Guest book ({guests.length})</h4>
      {guests.length === 0 ? (
        <p className="hint">Nobody signed in at this show yet.</p>
      ) : (
        <ul className="sh-guests">
          {guests.map((guest) => (
            <li key={guest.id}>{guest.name}</li>
          ))}
        </ul>
      )}

      <div className="sh-foot">
        <button className="btn" data-variant="quiet" onClick={() => onTrash(draft)}>
          Move to Trash
        </button>
      </div>
    </section>
  );
}
