import { useEffect, useRef, useState } from 'react';
import {
  addCheckItem,
  checklistProgress,
  createNote,
  editNote,
  noteTitle,
  removeCheckItem,
  searchNotes,
  speechSupport,
  toggleCheckItem,
  type Note,
  type Pin,
} from '../notes';

export interface PinTarget {
  pin: Pin;
  label: string;
}

interface Props {
  notes: Note[];
  /** Everything a note can be pinned to, labelled. */
  targets: PinTarget[];
  onSave: (note: Note) => void;
  onDelete: (note: Note) => void;
  onOpenPin: (pin: Pin) => void;
  onMessage: (message: string) => void;
  /** A note asked for from outside, or a new one pinned to something. */
  focus?: { id: string } | { newPin: Pin | null } | null;
}

const pinKey = (pin: Pin) => `${pin.kind}:${pin.id}`;

/**
 * Notes: quick notes and checklists, pinned to anything or to nothing. A note
 * whose record has gone keeps its words and says the record is gone.
 */
export function NotesWindow({ notes, targets, onSave, onDelete, onOpenPin, onMessage, focus }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const handled = useRef<unknown>(null);

  const make = (pin: Pin | null) => {
    const note = createNote('', pin);
    onSave(note);
    setSelectedId(note.id);
  };

  useEffect(() => {
    if (!focus || handled.current === focus) return;
    handled.current = focus;
    if ('id' in focus) setSelectedId(focus.id);
    else make(focus.newPin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const shown = searchNotes(notes, query);
  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const labelOf = (pin: Pin) => targets.find((t) => pinKey(t.pin) === pinKey(pin))?.label ?? null;

  return (
    <div className="sh-window nt-window">
      <div className="sh-bar">
        <div className="sh-new">
          <input
            aria-label="Find a note"
            type="search"
            placeholder="Find in notes and checklists"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" data-variant="primary" onClick={() => make(null)}>
            New note
          </button>
        </div>
      </div>
      <div className="sh-body">
        <ul className="sh-list">
          {notes.length === 0 && <li className="hint">No notes yet.</li>}
          {notes.length > 0 && shown.length === 0 && <li className="hint">No match.</li>}
          {shown.map((note) => (
            <li key={note.id}>
              <button aria-current={note.id === selectedId} onClick={() => setSelectedId(note.id)}>
                <strong>{noteTitle(note)}</strong>
                <span className="faint">
                  {[
                    checklistProgress(note),
                    note.pin ? labelOf(note.pin) ?? 'Pinned to something since removed' : null,
                    note.updatedAt.slice(0, 10),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <NoteDetail
            key={selected.id}
            note={selected}
            targets={targets}
            pinLabel={selected.pin ? labelOf(selected.pin) : null}
            onSave={onSave}
            onDelete={(note) => {
              onDelete(note);
              setSelectedId(null);
            }}
            onOpenPin={onOpenPin}
            onMessage={onMessage}
          />
        ) : (
          <p className="hint sh-empty">Pick a note, or start a new one.</p>
        )}
      </div>
    </div>
  );
}

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function NoteDetail(props: {
  note: Note;
  targets: PinTarget[];
  pinLabel: string | null;
  onSave: (note: Note) => void;
  onDelete: (note: Note) => void;
  onOpenPin: (pin: Pin) => void;
  onMessage: (message: string) => void;
}) {
  const { note, targets, pinLabel, onSave, onDelete, onOpenPin, onMessage } = props;
  const [text, setText] = useState(note.text);
  const [item, setItem] = useState('');
  const [listening, setListening] = useState(false);
  const textRef = useRef(text);
  textRef.current = text;
  const latest = useRef(note);
  latest.current = note;

  // The microphone appears only where the browser can listen (rule 8).
  const speech = speechSupport(window as unknown as Record<string, unknown>);

  const saveText = () => {
    if (textRef.current !== latest.current.text) onSave(editNote(latest.current, { text: textRef.current }));
  };

  const dictate = () => {
    if (!speech) return;
    const Ctor = (window as unknown as Record<string, SpeechCtor>)[speech]!;
    const recogniser = new Ctor();
    recogniser.lang = navigator.language || 'en-US';
    recogniser.interimResults = false;
    recogniser.onresult = (event) => {
      const heard = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (!heard) return;
      const next = textRef.current ? `${textRef.current.replace(/\s+$/, '')} ${heard}` : heard;
      setText(next);
      textRef.current = next;
      onSave(editNote(latest.current, { text: next }));
    };
    recogniser.onerror = (event) => {
      onMessage(
        event.error === 'not-allowed'
          ? 'The browser was not allowed to use the microphone. Allow it in the site settings to dictate.'
          : `Dictation stopped: ${event.error}.`,
      );
    };
    recogniser.onend = () => setListening(false);
    try {
      recogniser.start();
      setListening(true);
    } catch (cause) {
      onMessage(`Dictation could not start: ${String(cause)}`);
    }
  };

  return (
    <div className="sh-detail nt-detail">
      <textarea
        aria-label="Note"
        value={text}
        placeholder="Write anything. The first line is its title."
        onChange={(e) => setText(e.target.value)}
        onBlur={saveText}
      />
      {speech && (
        <div className="chip-row">
          <button className="btn" onClick={dictate} disabled={listening}>
            {listening ? 'Listening…' : 'Dictate'}
          </button>
        </div>
      )}

      <h4>Checklist</h4>
      <ul className="nt-list">
        {note.checklist.map((check) => (
          <li key={check.id} className="nt-check" data-done={check.done}>
            <input
              type="checkbox"
              checked={check.done}
              aria-label={check.text}
              onChange={() => onSave(toggleCheckItem(note, check.id))}
            />
            <span>{check.text}</span>
            <button className="btn" data-variant="quiet" aria-label={`Remove ${check.text}`} onClick={() => onSave(removeCheckItem(note, check.id))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="nt-check"
        onSubmit={(e) => {
          e.preventDefault();
          saveText();
          onSave(addCheckItem({ ...latest.current, text: textRef.current }, item));
          setItem('');
        }}
      >
        <input type="text" aria-label="New checklist item" placeholder="Add an item" value={item} onChange={(e) => setItem(e.target.value)} />
        <button className="btn" type="submit" disabled={!item.trim()}>
          Add
        </button>
      </form>

      <label className="field nt-pin">
        <span>Pinned to</span>
        <select
          value={note.pin ? `${note.pin.kind}:${note.pin.id}` : ''}
          onChange={(e) => {
            const target = targets.find((t) => `${t.pin.kind}:${t.pin.id}` === e.target.value);
            onSave(editNote({ ...note, text: textRef.current }, { pin: target?.pin ?? null }));
          }}
        >
          <option value="">Nothing</option>
          {note.pin && !pinLabel && <option value={`${note.pin.kind}:${note.pin.id}`}>Something since removed</option>}
          {targets.map((t) => (
            <option key={`${t.pin.kind}:${t.pin.id}`} value={`${t.pin.kind}:${t.pin.id}`}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {note.pin && pinLabel && (
        <button className="linkish" onClick={() => onOpenPin(note.pin!)}>
          Open {pinLabel}
        </button>
      )}

      <div className="sh-foot">
        <button className="btn" data-variant="quiet" onClick={() => onDelete(note)}>
          Move to Trash
        </button>
      </div>
    </div>
  );
}
