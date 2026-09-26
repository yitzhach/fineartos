import { useEffect, useRef } from 'react';
import { shortcutGroups, typingNote } from './shortcuts';

/**
 * Every key the app answers to, opened with ? or from the search box. Drawn
 * from shortcuts.ts, which lists only keys that do something.
 */
export function ShortcutSheet(props: { mac: boolean; compact: boolean; onClose: () => void }) {
  const { mac, compact, onClose } = props;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="shortcuts-scrim no-print" onClick={onClose}>
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shortcuts-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button ref={closeRef} className="btn" data-variant="quiet" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="faint shortcuts-note">{typingNote(mac)}</p>
        <div className="shortcuts-groups">
          {shortcutGroups({ mac, compact }).map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h3>{group.title}</h3>
              {group.note && <p className="faint shortcuts-note">{group.note}</p>}
              <dl>
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.what} className="shortcuts-row">
                    <dt>
                      {shortcut.keys.map((chord, i) => (
                        <span key={i} className="shortcuts-chord">
                          {i > 0 && <span className="faint shortcuts-or">or</span>}
                          {chord.map((key, k) => (
                            <kbd key={k}>{key}</kbd>
                          ))}
                        </span>
                      ))}
                    </dt>
                    <dd>{shortcut.what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
