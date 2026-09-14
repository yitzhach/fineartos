import { useState } from 'react';
import { SignaturePad } from '../../connect/ui/SignaturePad';
import type { Photo } from '../../photo/photo';
import { describePrice, describeSize } from '../../photo/photo';
import { milestonesOf } from '../milestones';
import type { CommissionDocument } from '../types';
import {
  awaitingReply,
  createUpdate,
  describeApproval,
  describeChannel,
  describePictures,
  draftProblem,
  emptyDraft,
  headlineFor,
  messageFor,
  recordApproval,
  recordHandoff,
  timelineFor,
  updatesFor,
  type ApprovalOutcome,
  type ApprovalRoute,
  type ClientUpdate,
  type HandoffChannel,
  type UpdateDraft,
} from '../updates';

interface Props {
  doc: CommissionDocument;
  updates: ClientUpdate[];
  photos: Photo[];
  imageUrls: Record<string, string>;
  invoices: { id: string; number: string; issuedAt: string | null }[];
  onSave: (update: ClientUpdate) => void;
  onDelete: (id: string) => void;
  /** Renders and hands over a file; the pane records what happened. */
  onHandoff: (update: ClientUpdate, channel: HandoffChannel) => Promise<void> | void;
  onMessage: (text: string) => void;
}

const ROUTES: { id: ApprovalRoute; label: string }[] = [
  { id: 'email', label: 'By email' },
  { id: 'text', label: 'By text' },
  { id: 'in-person', label: 'In person' },
  { id: 'call', label: 'On the phone' },
  { id: 'other', label: 'Some other way' },
];

/**
 * Keeping the client in the picture.
 *
 * Compose an update on one side, read the whole history on the other. The
 * history is built from the records rather than kept as its own log, so it
 * cannot drift out of step with what is actually stored.
 *
 * The honesty here is the point. Nothing on this page says an update was
 * sent, because the app has no way to send one — it says what the artist did
 * with it. And a reply is something the artist recorded, in the client's own
 * words, or signed in person on the tablet. Silence is shown as silence.
 */
export function UpdatesPane(props: Props) {
  const { doc, photos, imageUrls } = props;
  const [draft, setDraft] = useState<UpdateDraft>(emptyDraft);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const updates = updatesFor(props.updates, doc.id);
  const milestones = milestonesOf(doc);
  const waiting = awaitingReply(updates);
  const problem = draftProblem(draft);
  const rows = timelineFor({ updates, milestones, invoices: props.invoices });

  const titleOf = (photoId: string) => photos.find((p) => p.id === photoId)?.title ?? 'Picture';

  const save = () => {
    if (problem) return;
    props.onSave(createUpdate(doc.id, draft));
    setDraft(emptyDraft());
    props.onMessage('Update saved. Hand it over from the list below.');
  };

  return (
    <div className="upd">
      <div className="upd-compose">
        <h3>Tell the client where it is</h3>
        <p className="hint">
          Nothing here is sent. You make the update, then hand it over the way you already talk
          to this client — a text, an email, in person.
        </p>

        {milestones.length > 0 && (
          <div className="field">
            <label htmlFor="upd-stage">Stage</label>
            <select
              id="upd-stage"
              value={draft.milestoneId ?? ''}
              onChange={(e) => {
                const milestoneId = e.target.value || null;
                const milestone = milestones.find((one) => one.id === milestoneId) ?? null;
                setDraft({
                  ...draft,
                  milestoneId,
                  // The stage fills the headline in, unless one is written.
                  headline: draft.headline.trim() === '' ? headlineFor(milestone) : draft.headline,
                });
              }}
            >
              <option value="">Not about a particular stage</option>
              {milestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="upd-headline">Headline</label>
          <input
            id="upd-headline"
            value={draft.headline}
            placeholder="Underpainting done"
            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="upd-note">What to say</label>
          <textarea
            id="upd-note"
            rows={3}
            value={draft.note}
            placeholder="A line or two. The pictures do most of it."
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </div>

        {photos.length > 0 && (
          <div className="field">
            <label>Pictures</label>
            <div className="upd-picks">
              {photos.map((photo) => {
                const at = draft.photoIds.indexOf(photo.id);
                const picked = at >= 0;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className="upd-pick"
                    data-picked={picked}
                    aria-pressed={picked}
                    title={`${photo.title} — ${describeSize(photo) ?? 'size not recorded'} · ${describePrice(photo)}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        photoIds: picked
                          ? draft.photoIds.filter((id) => id !== photo.id)
                          : [...draft.photoIds, photo.id],
                      })
                    }
                  >
                    {imageUrls[photo.imageId] ? (
                      <img src={imageUrls[photo.imageId]} alt="" loading="lazy" />
                    ) : (
                      <span className="sheet-face" />
                    )}
                    {picked && <span className="upd-order" aria-hidden="true">{at + 1}</span>}
                  </button>
                );
              })}
            </div>
            <span className="hint">
              {describePictures(draft.photoIds.length)} picked. The first one is the big one on
              the card.
            </span>
          </div>
        )}

        <label className="check">
          <input
            type="checkbox"
            checked={draft.asksApproval}
            onChange={(e) => setDraft({ ...draft, asksApproval: e.target.checked })}
          />
          <span>Ask them to sign this stage off</span>
        </label>

        <div className="chip-row">
          <button className="btn" data-variant="primary" disabled={Boolean(problem)} onClick={save}>
            Save the update
          </button>
          {problem && <span className="hint">{problem}</span>}
        </div>
      </div>

      <div className="upd-history">
        <div className="upd-head">
          <h3>{updates.length === 1 ? '1 update' : `${updates.length} updates`}</h3>
          <span className="hint">
            {waiting.length === 0
              ? 'Nothing waiting on a reply'
              : `${waiting.length} asked for a sign-off with no reply recorded`}
          </span>
        </div>

        {updates.length === 0 ? (
          <div className="empty">
            <h3>Nothing sent yet</h3>
            <p>
              Everything you tell this client will be listed here with the date, so a year from
              now you can see exactly what was said and when.
            </p>
          </div>
        ) : (
          <ul className="upd-list">
            {updates.map((update) => (
              <li key={update.id} className="upd-item">
                <div className="upd-item-head">
                  <strong>{update.headline}</strong>
                  <span className="fnd-detail">{formatWhen(update.createdAt)}</span>
                </div>
                {update.note && <p className="upd-note">{update.note}</p>}
                {update.photoIds.length > 0 && (
                  <div className="upd-thumbs">
                    {update.photoIds.map((photoId) => {
                      const photo = photos.find((one) => one.id === photoId);
                      const url = photo ? imageUrls[photo.imageId] : undefined;
                      return url ? (
                        <img key={photoId} src={url} alt={titleOf(photoId)} title={titleOf(photoId)} />
                      ) : null;
                    })}
                  </div>
                )}

                <div className="chip-row">
                  <button className="btn" onClick={() => void props.onHandoff(update, 'jpeg')}>
                    Save as a picture
                  </button>
                  <button className="btn" data-variant="quiet" onClick={() => void props.onHandoff(update, 'share')}>
                    Share
                  </button>
                  <button className="btn" data-variant="quiet" onClick={() => void props.onHandoff(update, 'page')}>
                    Save as a page
                  </button>
                  <button className="btn" data-variant="quiet" onClick={() => void props.onHandoff(update, 'pdf')}>
                    Print / Save as PDF
                  </button>
                  <button className="btn" data-variant="quiet" onClick={() => void props.onHandoff(update, 'copy')}>
                    Copy the message
                  </button>
                  {doc.client.email && (
                    <a
                      className="btn"
                      data-variant="quiet"
                      href={`mailto:${encodeURIComponent(doc.client.email)}?subject=${encodeURIComponent(
                        `${doc.title} — ${update.headline}`,
                      )}&body=${encodeURIComponent(
                        messageFor(update, {
                          studioName: doc.studio.name,
                          clientName: doc.client.name,
                          title: doc.title,
                        }),
                      )}`}
                      onClick={() => void props.onHandoff(update, 'copy')}
                    >
                      Email
                    </a>
                  )}
                  <button
                    className="btn"
                    data-variant="quiet"
                    onClick={() => props.onDelete(update.id)}
                  >
                    Remove
                  </button>
                </div>

                <div className="upd-reply">
                  <span className="fnd-detail" data-answered={update.approval !== null}>
                    {describeApproval(update)}
                    {update.approval?.words ? ` — “${update.approval.words}”` : ''}
                  </span>
                  <button
                    className="btn"
                    data-variant="quiet"
                    onClick={() => setReplyTo(replyTo === update.id ? null : update.id)}
                  >
                    {update.approval ? 'Change what they said' : 'Record what they said'}
                  </button>
                </div>

                {replyTo === update.id && (
                  <ReplyForm
                    update={update}
                    onCancel={() => setReplyTo(null)}
                    onRecord={(outcome, words, route, signaturePaths) => {
                      props.onSave(
                        recordApproval(update, { outcome, words, route, signaturePaths }),
                      );
                      setReplyTo(null);
                      props.onMessage('Recorded, in their words.');
                    }}
                  />
                )}

                {update.handoffs.length > 0 && (
                  <ul className="upd-handoffs">
                    {update.handoffs.map((handoff, index) => (
                      <li key={index}>
                        {describeChannel(handoff.channel)} · {formatWhen(handoff.at)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 && (
          <div className="upd-timeline">
            <h4>Everything, in order</h4>
            <ol>
              {rows.map((row) => (
                <li key={row.id} data-kind={row.kind}>
                  <span className="upd-when">{formatWhen(row.at)}</span>
                  <span className="upd-what">
                    {row.label}
                    {row.detail ? <span className="fnd-detail">{row.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Recording a reply. The artist types what the client actually said, or hands
 * the tablet over and has them sign it — the app never writes the words.
 */
function ReplyForm({
  update,
  onRecord,
  onCancel,
}: {
  update: ClientUpdate;
  onRecord: (
    outcome: ApprovalOutcome,
    words: string | null,
    route: ApprovalRoute | null,
    signaturePaths: string[] | null,
  ) => void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<ApprovalOutcome>(update.approval?.outcome ?? 'approved');
  const [route, setRoute] = useState<ApprovalRoute>(update.approval?.route ?? 'email');
  const [words, setWords] = useState(update.approval?.words ?? '');
  const [paths, setPaths] = useState<string[]>(update.approval?.signaturePaths ?? []);

  return (
    <div className="upd-reply-form">
      <div className="chip-row">
        <button
          className="btn"
          data-variant={outcome === 'approved' ? 'primary' : 'quiet'}
          aria-pressed={outcome === 'approved'}
          onClick={() => setOutcome('approved')}
        >
          They approved it
        </button>
        <button
          className="btn"
          data-variant={outcome === 'changes' ? 'primary' : 'quiet'}
          aria-pressed={outcome === 'changes'}
          onClick={() => setOutcome('changes')}
        >
          They asked for a change
        </button>
      </div>

      <div className="field">
        <label htmlFor={`route-${update.id}`}>How it reached you</label>
        <select
          id={`route-${update.id}`}
          value={route}
          onChange={(e) => setRoute(e.target.value as ApprovalRoute)}
        >
          {ROUTES.map((one) => (
            <option key={one.id} value={one.id}>
              {one.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={`words-${update.id}`}>Their words</label>
        <textarea
          id={`words-${update.id}`}
          rows={2}
          value={words}
          placeholder="Paste the reply, or type what they said"
          onChange={(e) => setWords(e.target.value)}
        />
        <span className="hint">
          Theirs, not a summary. This is the line that settles it later.
        </span>
      </div>

      {route === 'in-person' && (
        <div className="field">
          <label>Signed here</label>
          <SignaturePad paths={paths} onChange={setPaths} />
        </div>
      )}

      <div className="chip-row">
        <button
          className="btn"
          data-variant="primary"
          onClick={() =>
            onRecord(outcome, words.trim() || null, route, paths.length > 0 ? paths : null)
          }
        >
          Record it
        </button>
        <button className="btn" data-variant="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** "12 Mar 2026, 14:20" in the reader's own timezone. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export { recordHandoff };
