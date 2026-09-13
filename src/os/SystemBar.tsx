import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../lib/prefs';
import { useFullscreen } from './fullscreen';

interface Props {
  studioName: string;
  search: string;
  onSearch: (value: string) => void;
  /** Verbatim status text from the persistence layer. Never embellished here. */
  statusText: string;
  statusState: string;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  /** Collects the open windows into one frame of tabs. */
  onMergeWindows: () => void;
  /** How many windows are on screen: fewer than two, nothing to merge. */
  openWindows: number;
  initials: string;
}

function MiniCalendar({ today }: { today: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="popover" role="dialog" aria-label="Calendar">
      <h4>{today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h4>
      <table className="cal">
        <thead>
          <tr>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <th key={i} scope="col">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => (
                <td key={di} data-today={day === today.getDate() ? 'true' : 'false'}>
                  {day ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SystemBar(props: Props) {
  const fullscreen = useFullscreen();
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState<'clock' | 'profile' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="systembar" ref={barRef}>
      <span className="brand">Artist OS</span>
      <span className="studio">{props.studioName || 'Studio name not set'}</span>

      <div className="spacer" />

      <div className="search">
        <label className="sr-only" htmlFor="doc-search">Search documents</label>
        <input
          id="doc-search"
          type="text"
          placeholder="Search client, title or number"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
        />
      </div>

      <span className="status-pill" title={props.statusText}>
        <span className="status-dot" data-state={props.statusState} aria-hidden="true" />
        {props.statusText}
      </span>

      <button
        className="btn"
        data-variant="quiet"
        onClick={props.onToggleTheme}
        aria-label={`Switch to ${props.theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {props.theme === 'dark' ? '☾' : '☀'}
      </button>

      {/* Left out entirely where the browser has no element fullscreen API —
          iPhone Safari, chiefly. A button that does nothing is worse than
          no button. */}
      {fullscreen.supported && (
        <button
          className="btn"
          data-variant="quiet"
          onClick={() => void fullscreen.toggle()}
          aria-pressed={fullscreen.active}
          aria-label={fullscreen.active ? 'Leave fullscreen' : 'Go fullscreen'}
          title={
            fullscreen.error ??
            (fullscreen.active ? 'Leave fullscreen (or press Esc)' : 'Go fullscreen')
          }
        >
          {fullscreen.active ? '⤡' : '⤢'}
        </button>
      )}

      <button
        className="btn clock"
        data-variant="quiet"
        onClick={() => setOpen(open === 'clock' ? null : 'clock')}
        aria-expanded={open === 'clock'}
      >
        {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
      </button>

      <button
        className="avatar"
        onClick={() => setOpen(open === 'profile' ? null : 'profile')}
        aria-expanded={open === 'profile'}
        aria-label="Profile and settings"
      >
        {props.initials || '—'}
      </button>

      {open === 'clock' && <MiniCalendar today={now} />}
      {open === 'profile' && (
        <div className="popover" role="dialog" aria-label="Profile">
          <h4>{props.studioName || 'Studio name not set'}</h4>
          <p className="faint" style={{ margin: '0 0 10px', fontSize: 12 }}>
            Studio details are saved as defaults for new documents. Edit them in the
            Studio section of any document.
          </p>
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>
            No account is connected. This build stores work on this device only.
          </p>
          <button
            className="btn"
            style={{ marginTop: 10, width: '100%' }}
            disabled={props.openWindows < 2}
            title={
              props.openWindows < 2
                ? 'Two or more windows are needed to merge them'
                : 'Put every open window into one frame of tabs'
            }
            onClick={() => {
              setOpen(null);
              props.onMergeWindows();
            }}
          >
            Merge windows into tabs
          </button>
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 11.5 }}>
            A tab moves back out with ⧉ on the tab, or by double clicking it.
          </p>
          <button
            className="btn"
            style={{ marginTop: 10, width: '100%' }}
            onClick={() => {
              setOpen(null);
              props.onOpenSettings();
            }}
          >
            Settings
          </button>
        </div>
      )}
    </div>
  );
}
