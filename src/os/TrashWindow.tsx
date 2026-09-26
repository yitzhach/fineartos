import { useState } from 'react';
import {
  attachedIds,
  countPhrase,
  deletionTargets,
  describeWhen,
  summarise,
  type AttachedRecord,
  type Trash,
  type TrashSummary,
  type TrashEntry,
} from './trash';

interface Props {
  trash: Trash;
  /** Every client update in the studio, so the questions can count them. */
  updates: AttachedRecord[];
  onPutBack: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onEmpty: () => void;
}

/**
 * What is in the Trash, and the two ways out of it.
 *
 * Every destructive button here asks a second time, and the question names
 * exactly what would go — including the records inside a folder, which is the
 * number people are surprised by. "Put back" is always the easier click.
 */
export function TrashWindow({ trash, updates, onPutBack, onDeleteForever, onEmpty }: Props) {
  // Which confirmation is showing: 'all' for Empty Trash, or an entry's id.
  const [confirming, setConfirming] = useState<string | null>(null);

  const summary = summarise(trash, updates);

  if (trash.length === 0) {
    return (
      <div className="empty">
        <h3>The Trash is empty</h3>
        <p>
          Drag a file or a folder onto the Trash on the desktop, or select it and choose Move to
          Trash. Nothing is deleted until you empty the Trash.
        </p>
      </div>
    );
  }

  return (
    <div className="trash-window">
      <div className="trash-head">
        <p className="hint">
          {countPhrase(summary.entries)} in the Trash
          {summary.records !== summary.entries && ` — ${countPhrase(summary.records, 'record')} in total`}
          . Nothing here has been deleted.
        </p>
        <button className="btn" data-variant="danger" onClick={() => setConfirming('all')}>
          Empty Trash
        </button>
      </div>

      {confirming === 'all' && (
        <Confirm
          question={`Delete ${countPhrase(summary.records, 'record')} forever?`}
          detail={describeContents(summary)}
          confirmLabel={`Delete ${countPhrase(summary.records, 'record')} forever`}
          onConfirm={() => {
            onEmpty();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      <ul className="trash-list">
        {trash.map((entry) => (
          <li key={entry.id} className="trash-row">
            <span className={`trash-face ${entry.kind}`} aria-hidden="true" />
            <span className="trash-what">
              <span className="trash-name">{entry.name}</span>
              <span className="trash-detail">
                {kindLabel(entry.kind)}
                {entry.contains.length > 0 && ` · holding ${countPhrase(entry.contains.length)}`}
                {' · '}
                {describeWhen(entry.deletedAt)}
              </span>
            </span>
            <button className="btn" onClick={() => onPutBack(entry.id)}>
              Put back
            </button>
            <button className="btn" data-variant="quiet" onClick={() => setConfirming(entry.id)}>
              Delete forever
            </button>

            {confirming === entry.id && (
              <Confirm
                question={`Delete “${entry.name}” forever?`}
                detail={describeEntry(entry, updates)}
                confirmLabel="Delete forever"
                onConfirm={() => {
                  onDeleteForever(entry.id);
                  setConfirming(null);
                }}
                onCancel={() => setConfirming(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The second ask. Keeping is the quiet default and deleting is the one in red,
 * so the dangerous button is never the one a stray click lands on.
 */
function Confirm({
  question,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  question: string;
  detail: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="trash-confirm" role="alertdialog" aria-label={question}>
      <div>
        <strong>{question}</strong>
        <span className="trash-detail">{detail}</span>
      </div>
      <button className="btn" autoFocus onClick={onCancel}>
        Keep it
      </button>
      <button className="btn" data-variant="danger" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  );
}

function kindLabel(kind: TrashEntry['kind']): string {
  if (kind === 'project') return 'Folder';
  if (kind === 'invoice') return 'Invoice';
  if (kind === 'photo') return 'Picture';
  if (kind === 'show') return 'Show';
  if (kind === 'note') return 'Note';
  return 'Commission';
}

/**
 * Names what is going, including the records inside a folder — the count in
 * the question is the total, so the detail has to account for all of it or
 * the two read as a contradiction.
 */
function describeContents({
  folders,
  documents,
  invoices,
  pictures,
  shows,
  notes,
  fees,
  records,
  entries,
  updates,
}: TrashSummary): string {
  const parts: string[] = [];
  if (folders) parts.push(countPhrase(folders, 'folder'));
  if (documents) parts.push(countPhrase(documents, 'commission'));
  if (invoices) parts.push(countPhrase(invoices, 'invoice'));
  if (pictures) parts.push(countPhrase(pictures, 'picture'));
  if (shows) parts.push(countPhrase(shows, 'show'));
  if (notes) parts.push(countPhrase(notes, 'note'));
  const inside = records - entries - updates - fees;
  if (inside > 0) parts.push(`${countPhrase(inside)} filed inside`);
  // Named, because nobody put these in the Trash themselves: they follow the
  // commission they belong to, and this is the only warning they get.
  if (updates) parts.push(`${countPhrase(updates, 'client update')} belonging to them`);
  if (fees) parts.push(`${countPhrase(fees, 'booth-fee row')} in the books`);
  const back = shows ? ' Pieces taken to those shows go back where they were.' : '';
  return `${parts.join(', ')}.${back} This cannot be undone.`;
}

/** The same honesty for one row: what goes with it, named and counted. */
function describeEntry(entry: TrashEntry, updates: AttachedRecord[]): string {
  const targets = deletionTargets(entry);
  const going = attachedIds(targets, updates.filter((one) => one.kind !== 'fee')).length;
  const fees = attachedIds(targets, updates.filter((one) => one.kind === 'fee')).length;
  const parts: string[] = [];
  if (entry.contains.length > 0) {
    parts.push(
      `This folder and the ${countPhrase(entry.contains.length)} inside it — ${countPhrase(
        targets.length,
        'record',
      )}`,
    );
  }
  if (going > 0) parts.push(`${countPhrase(going, 'client update')} belonging to it`);
  if (entry.kind === 'show') {
    const what = fees > 0 ? 'The show and its booth-fee row in the books' : 'The show';
    return `${what} — gone for good. Its pieces go back where they were. This cannot be undone.`;
  }
  if (parts.length === 0) return 'This cannot be undone.';
  return `${parts.join(', and ')} — gone for good. This cannot be undone.`;
}
