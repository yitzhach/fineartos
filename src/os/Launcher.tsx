import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';
import { searchLauncher, suggestions, TRY_THESE, type LauncherEntry } from './launcher';

interface Props {
  /** Everything that can be found right now: tools, actions, records. */
  entries: LauncherEntry[];
  onChoose: (entry: LauncherEntry) => void;
  /** Goes up by one each time ⌘K, Ctrl+K or / asks for the box. */
  summon: number;
  /** On a phone the box is a button in the bar that opens a sheet. */
  compact: boolean;
  /** The keys that summon it, as drawn: ['⌘', 'K'] or ['Ctrl', 'K']. */
  summonKeys: string[];
}

/** The dock's own pictures, so a tool looks the same here as it does there. */
const ICONS: Record<string, IconName> = {
  'tool:commissions': 'projects',
  'tool:invoices': 'invoices',
  'tool:finder': 'finder',
  'tool:connect': 'connect',
  'tool:artwork': 'artwork',
  'tool:shows': 'shows',
  'tool:finance': 'finance',
  'tool:trash': 'trash',
  'tool:home': 'home',
  'action:new-commission': 'new',
};

function Glass() {
  return (
    <svg className="launcher-glass" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The search box in the system bar: type what you want and go there.
 *
 * It finds tools by the words artists use for them, the things that can be
 * done right now, and the studio's own records — a client, an invoice number,
 * a show. Empty, it lists the tools with their shortcuts, which is how the
 * shortcuts get learned. The ranking lives in launcher.ts; this only draws it.
 *
 * Keyboard first, pointer friendly: ↑ ↓ and Enter, Esc to back out, and a
 * click or a tap on any row. It is a combobox in the ARIA sense, so a screen
 * reader hears the active row as the arrows move.
 */
export function Launcher({ entries, onChoose, summon, compact, summonKeys }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const typed = query.trim() !== '';
  const results = useMemo(
    () => (typed ? searchLauncher(entries, query) : suggestions(entries)),
    [entries, query, typed],
  );

  // Asked for by a shortcut: open, and put the cursor in the box.
  useEffect(() => {
    if (summon === 0) return;
    setOpen(true);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [summon]);

  // A press anywhere else puts it away.
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // optionId is derived from listId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const choose = (entry: LauncherEntry) => {
    close();
    onChoose(entry);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      const entry = results[active] ?? results[0];
      if (entry) {
        event.preventDefault();
        choose(entry);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (typed) setQuery('');
      else close();
    }
  };

  const showBox = !compact || open;

  return (
    <div className="launcher" data-compact={compact} data-open={open} ref={rootRef} role="search">
      {compact && !open && (
        <button
          className="btn launcher-button"
          data-variant="quiet"
          aria-label="Search tools, clients and records"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <Glass />
        </button>
      )}

      {showBox && (
        <div className="launcher-box">
          <Glass />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search tools, clients and records"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? optionId(active) : undefined}
            placeholder="Search tools, clients, invoices…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {!open && !compact && (
            <span className="launcher-keys" aria-hidden="true" title="Or press / when not typing">
              {summonKeys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
          )}
          {compact && open && (
            <button className="btn launcher-cancel" data-variant="quiet" onClick={close}>
              Cancel
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="launcher-panel">
          {!typed && <p className="launcher-head">Tools and shortcuts</p>}
          <ul id={listId} role="listbox" aria-label="Results" className="launcher-list">
            {results.map((entry, index) => {
              const icon = ICONS[entry.id];
              return (
                <li
                  key={entry.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  className="launcher-row"
                  data-section={entry.section}
                  // Keeps the cursor in the box, so a click is a choice and not a blur.
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerMove={() => {
                    if (index !== active) setActive(index);
                  }}
                  onClick={() => choose(entry)}
                >
                  <span className="launcher-icon" aria-hidden="true">
                    {icon ? <Icon name={icon} size={17} /> : <span className="launcher-dot" />}
                  </span>
                  <span className="launcher-text">
                    <span className="launcher-title">{entry.title}</span>
                    <span className="launcher-hint">{entry.hint}</span>
                  </span>
                  <span className="launcher-meta">
                    {/* Keys mean nothing on a phone with no keyboard. */}
                    {entry.keys && !compact ? (
                      <span className="launcher-keys" aria-label={`Shortcut: ${entry.keys.join(' then ')}`}>
                        {entry.keys.map((key, i) => (
                          <kbd key={i}>{key}</kbd>
                        ))}
                      </span>
                    ) : (
                      <span className="launcher-label">{entry.label}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {typed && results.length === 0 && (
            <p className="launcher-empty">
              Nothing matches “{query.trim()}”. Try a tool, a client’s name or an invoice number.
            </p>
          )}
          {!typed && (
            <p className="launcher-try">
              Try{' '}
              {TRY_THESE.map((word) => (
                <button
                  key={word}
                  className="launcher-chip"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery(word);
                    inputRef.current?.focus();
                  }}
                >
                  {word}
                </button>
              ))}{' '}
              or a client’s name.
            </p>
          )}
          {!compact && (
            <p className="launcher-foot">
              <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close ·{' '}
              <kbd>G</kbd> then a letter opens a tool
            </p>
          )}
        </div>
      )}
    </div>
  );
}
