import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Theme } from '../lib/prefs';
import { useFullscreen } from './fullscreen';
import type { TileLayout } from './tiling';

/** What the Arrange menu can do, and whether each thing can be done now. */
export interface ArrangeControls {
  /** Frames on screen; a group of tabs counts once. */
  frames: number;
  /** Something is snapped or tiled, so there is something to put back. */
  snapped: boolean;
  autoTile: boolean;
  layout: TileLayout;
  onTile: (layout: TileLayout) => void;
  onCascade: () => void;
  onUntile: () => void;
  onAutoTile: (on: boolean) => void;
  /** The keys that snap the window in front, as drawn: ⌥⇧ or Alt+Shift. */
  snapKeys: string;
}

const LAYOUTS: { layout: TileLayout; name: string; hint: string }[] = [
  { layout: 'columns', name: 'Side by side', hint: 'A column each' },
  { layout: 'grid', name: 'Grid', hint: 'As square as fits' },
  { layout: 'main', name: 'Front one large', hint: 'The rest beside it' },
  { layout: 'rows', name: 'Top to bottom', hint: 'A row each' },
];

/** A layout drawn as a little screen, so the choice can be seen before it is made. */
export function LayoutPicture({ layout }: { layout: TileLayout }) {
  const cells: Record<TileLayout, [number, number, number, number][]> = {
    columns: [[1, 1, 10, 16], [13, 1, 10, 16], [25, 1, 10, 16]],
    grid: [[1, 1, 16, 7.5], [19, 1, 16, 7.5], [1, 10.5, 34, 6.5]],
    main: [[1, 1, 20, 16], [23, 1, 12, 7.5], [23, 10.5, 12, 6.5]],
    rows: [[1, 1, 34, 4.6], [1, 7.2, 34, 4.6], [1, 13.4, 34, 3.6]],
  };
  return (
    <svg className="layout-picture" width="36" height="18" viewBox="0 0 36 18" aria-hidden="true">
      {cells[layout].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="1.5" />
      ))}
    </svg>
  );
}

interface Props {
  studioName: string;
  /** The search box: tools, actions and records. Drawn by Launcher. */
  launcher: ReactNode;
  /** Absent on a phone, where every window is a sheet and nothing tiles. */
  arrange?: ArrangeControls;
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
  const [open, setOpen] = useState<'clock' | 'profile' | 'arrange' | null>(null);
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
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="systembar" ref={barRef}>
      <span className="brand">Artist OS</span>
      <span className="studio">{props.studioName || 'Studio name not set'}</span>

      <div className="spacer" />

      {props.launcher}

      <div className="spacer" />

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

      {props.arrange && (
        <button
          className="btn arrange-button"
          data-variant="quiet"
          onClick={() => setOpen(open === 'arrange' ? null : 'arrange')}
          aria-expanded={open === 'arrange'}
          aria-label="Arrange windows"
          title="Arrange windows: tile, cascade, auto-tile"
        >
          <LayoutPicture layout="grid" />
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
      {open === 'arrange' && props.arrange && (
        <ArrangeMenu controls={props.arrange} onDone={() => setOpen(null)} />
      )}
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

function ArrangeMenu({ controls, onDone }: { controls: ArrangeControls; onDone: () => void }) {
  const two = controls.frames >= 2;
  const why = two ? undefined : 'Two or more windows are needed to tile them';
  return (
    <div className="popover arrange-menu" role="dialog" aria-label="Arrange windows">
      <h4>Arrange windows</h4>
      <div className="arrange-layouts">
        {LAYOUTS.map(({ layout, name, hint }) => (
          <button
            key={layout}
            className="arrange-layout"
            data-current={controls.autoTile && controls.layout === layout}
            disabled={!two}
            title={why ?? hint}
            onClick={() => {
              controls.onTile(layout);
              onDone();
            }}
          >
            <LayoutPicture layout={layout} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="arrange-row">
        <button
          className="btn"
          disabled={!two}
          title={why ?? 'Each at its own size, stepped so every titlebar shows'}
          onClick={() => {
            controls.onCascade();
            onDone();
          }}
        >
          Cascade
        </button>
        <button
          className="btn"
          disabled={!controls.snapped}
          title={
            controls.snapped
              ? 'Every snapped or tiled window goes back to the size it was given'
              : 'Nothing is snapped or tiled'
          }
          onClick={() => {
            controls.onUntile();
            onDone();
          }}
        >
          Put back
        </button>
      </div>
      <label className="arrange-auto">
        <input
          type="checkbox"
          checked={controls.autoTile}
          onChange={(event) => controls.onAutoTile(event.target.checked)}
        />
        <span>
          Auto-tile
          <span className="faint"> — windows arrange themselves whenever one opens or closes</span>
        </span>
      </label>
      <p className="faint arrange-keys">
        Drag a titlebar to an edge to snap it. {controls.snapKeys} with an arrow snaps the window
        in front.
      </p>
    </div>
  );
}
