import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isZoomed, MIN_HEIGHT, MIN_WIDTH, type WindowState } from './windows';
import type { Zone } from './tiling';

interface Props {
  window: WindowState;
  /**
   * Every window drawn in this frame. One entry is a plain window and no
   * strip is drawn; more than one is a group of tabs, and `window` above is
   * whichever of them is on top.
   */
  tabs?: WindowState[];
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  /** Takes one tab back out into a window of its own. */
  onPullOutTab?: (id: string) => void;
  focused: boolean;
  /** True on a phone: the frame becomes a full-screen sheet, not a window. */
  compact: boolean;
  toolbar?: ReactNode;
  sidebar?: ReactNode;
  inspector?: ReactNode;
  children: ReactNode;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onZoom: () => void;
  /**
   * The drag is over. `to` is where the window was let go, in the desktop's
   * coordinates. The desktop decides what that means: a snap, a tab, or a
   * window that has simply been moved.
   */
  onDragEnd: (to: { x: number; y: number }) => void;
  onResize: (width: number, height: number) => void;
  /**
   * Where the pointer is during a titlebar drag, in client coordinates. The
   * desktop uses it to light up a snap zone or a frame to join as a tab.
   */
  onDragTo?: (point: { x: number; y: number }) => void;
  /** Snap into a zone from the titlebar's menu, or put it back. Absent on a phone. */
  onSnap?: (zone: Zone | 'restore') => void;
  /** True while letting go here would make this frame's tabs take it in. */
  dropTarget?: boolean;
  /**
   * The content fills the frame and does its own scrolling — the darkroom,
   * where the picture has to stay on screen while the tools are used. The
   * body stops scrolling as a page and becomes a box to fill.
   */
  fills?: boolean;
}

/**
 * One window's chrome: titlebar, traffic lights, optional left rail and right
 * inspector, and the drag and resize behaviour.
 *
 * On a phone this is not a window at all. Dragging overlapping windows with a
 * thumb is miserable, so under 860px the frame fills the screen, the lights
 * become a single Done control, and the rails collapse into the body. The
 * window *state* is identical either way — only the presentation changes —
 * so nothing about the app has to know which one it is running in.
 */
export function Frame({
  window: win,
  tabs,
  onSelectTab,
  onCloseTab,
  onPullOutTab,
  focused,
  compact,
  toolbar,
  sidebar,
  inspector,
  children,
  onFocus,
  onClose,
  onMinimize,
  onZoom,
  onDragEnd,
  onResize,
  onDragTo,
  onSnap,
  dropTarget,
  fills,
}: Props) {
  const frameRef = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const resizing = useRef<Resize | null>(null);
  const [menu, setMenu] = useState(false);
  // Read by the pointer listeners, which are added once rather than on every
  // render: the callbacks are new functions each time the desktop draws.
  const handlers = useRef({ onDragTo, onDragEnd, onResize });
  handlers.current = { onDragTo, onDragEnd, onResize };
  /** The rect React last drew, which is what it believes the frame's style holds. */
  const drawn = useRef(win.rect);
  drawn.current = win.rect;

  /**
   * Dragging and resizing move the frame itself, not the app's state. The
   * whole desktop used to redraw sixty times a second while a window moved —
   * every open tool, not just this one — which is what made dragging stutter
   * with the Finance or Artwork window open. The new place is handed over
   * once, when the pointer is let go.
   */
  useEffect(() => {
    if (compact) return undefined;

    const move = (event: PointerEvent) => {
      const frame = frameRef.current;
      const d = drag.current;
      if (d && frame) {
        const dx = event.clientX - d.pointerX;
        const dy = event.clientY - d.pointerY;
        // A click, or the first twitch of a double click, is not a drag.
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        if (!d.moved) {
          d.moved = true;
          // Snapped or filling the screen: it comes away at the size it was
          // given by hand, still under the pointer where it was picked up.
          if (d.free) {
            frame.style.width = `${d.free.width}px`;
            frame.style.height = `${d.free.height}px`;
          }
        }
        const width = d.free?.width ?? d.width;
        const grab = d.free ? d.grabX * (d.free.width / d.width) : d.grabX;
        const x = Math.max(-width + 120, d.originX + d.grabX - grab + dx);
        const y = Math.max(0, d.originY + dy);
        frame.style.left = `${x}px`;
        frame.style.top = `${y}px`;
        d.last = { x, y };
        handlers.current.onDragTo?.({ x: event.clientX, y: event.clientY });
        return;
      }
      const r = resizing.current;
      if (r && frame) {
        const width = Math.max(MIN_WIDTH, r.width + (event.clientX - r.pointerX));
        const height = Math.max(MIN_HEIGHT, r.height + (event.clientY - r.pointerY));
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
        r.last = { width, height };
      }
    };
    // Let go, or the browser took the pointer away: either way the window
    // stays where it can be seen, and the desktop is told once.
    const up = () => {
      const d = drag.current;
      const r = resizing.current;
      drag.current = null;
      resizing.current = null;
      // Hand the frame back to React exactly as React last drew it. React
      // writes only the style values that differ from its previous render —
      // not whatever a drag left behind — so a snap that happened to keep the
      // old top left the window hanging where the pointer let go. Both this
      // and React's own update land before the next paint: nothing flickers.
      const frame = frameRef.current;
      if (frame && (d?.moved || r?.last)) {
        const rect = drawn.current;
        frame.style.left = `${rect.x}px`;
        frame.style.top = `${rect.y}px`;
        frame.style.width = `${rect.width}px`;
        frame.style.height = `${rect.height}px`;
      }
      if (d?.moved && d.last) handlers.current.onDragEnd(d.last);
      if (r?.last) handlers.current.onResize(r.last.width, r.last.height);
    };

    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', up);
    globalThis.addEventListener('pointercancel', up);
    return () => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', up);
      globalThis.removeEventListener('pointercancel', up);
    };
  }, [compact]);

  // The snap menu goes away on a press anywhere else, or on Escape.
  useEffect(() => {
    if (!menu) return undefined;
    const away = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest?.('.frame-snap')) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);

  const startDrag = (event: React.PointerEvent) => {
    onFocus();
    if (compact) return;
    // Ignore drags that start on a control in the titlebar.
    if ((event.target as HTMLElement).closest('button')) return;
    const box = frameRef.current?.getBoundingClientRect();
    drag.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: win.rect.x,
      originY: win.rect.y,
      width: win.rect.width,
      grabX: box ? event.clientX - box.left : win.rect.width / 2,
      free: win.restoreRect ? { width: win.restoreRect.width, height: win.restoreRect.height } : null,
      moved: false,
      last: null,
    };
  };

  const startResize = (event: React.PointerEvent) => {
    event.stopPropagation();
    onFocus();
    resizing.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: win.rect.width,
      height: win.rect.height,
      last: null,
    };
  };

  const style = compact
    ? undefined
    : {
        left: win.rect.x,
        top: win.rect.y,
        width: win.rect.width,
        height: win.rect.height,
        zIndex: win.z,
      };

  return (
    <section
      ref={frameRef}
      className="frame"
      data-focused={focused}
      data-compact={compact}
      data-drop-target={dropTarget === true}
      style={style}
      role="dialog"
      aria-label={win.title}
      onPointerDown={onFocus}
    >
      <header className="frame-bar" onPointerDown={startDrag} onDoubleClick={onZoom}>
        <div className="lights">
          <button className="light close" onClick={onClose} aria-label={`Close ${win.title}`} title="Close">
            <span aria-hidden="true">✕</span>
          </button>
          <button
            className="light min"
            onClick={onMinimize}
            aria-label={`Minimise ${win.title}`}
            title="Minimise"
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            className="light zoom"
            onClick={onZoom}
            aria-label={isZoomed(win) ? 'Restore size' : 'Fill the screen'}
            title={isZoomed(win) ? 'Restore' : 'Fill the screen'}
          >
            <span aria-hidden="true">{isZoomed(win) ? '↙' : '↗'}</span>
          </button>
        </div>

        <div className="frame-title">
          <span className="t">{win.title}</span>
          {win.subtitle && <span className="s">{win.subtitle}</span>}
        </div>

        {onSnap && !compact && (
          <div className="frame-snap">
            <button
              className="frame-snap-button"
              onClick={() => setMenu(!menu)}
              onDoubleClick={(event) => event.stopPropagation()}
              aria-expanded={menu}
              aria-label={`Snap ${win.title} to part of the screen`}
              title="Snap to a half, a quarter or the whole screen"
            >
              <SnapGlyph />
            </button>
            {menu && (
              <div className="snap-menu" role="menu" aria-label="Snap window">
                <div className="snap-grid">
                  {ZONES.map(({ zone, label }) => (
                    <button
                      key={zone}
                      role="menuitem"
                      className="snap-target"
                      data-current={win.snap === zone}
                      aria-label={label}
                      title={label}
                      onClick={() => {
                        setMenu(false);
                        onSnap(zone);
                      }}
                    >
                      <span className="snap-mini" aria-hidden="true">
                        <span className="snap-area" data-zone={zone} />
                      </span>
                    </button>
                  ))}
                </div>
                {isZoomed(win) && (
                  <button
                    role="menuitem"
                    className="btn snap-restore"
                    onClick={() => {
                      setMenu(false);
                      onSnap('restore');
                    }}
                  >
                    Back to its own size
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* On a phone the lights are too small and mean too little, so the
            same actions appear as one obvious control. */}
        <button className="btn frame-done" data-variant="quiet" onClick={onClose}>
          Done
        </button>
      </header>

      {/* The strip only exists when there is more than one thing in the
          frame: a single tab is just a window with a redundant label. */}
      {tabs && tabs.length > 1 && (
        <div className="frame-tabs" role="tablist" aria-label={`Tabs in ${win.title}`}>
          {tabs.map((tab) => (
            <div key={tab.id} className="frame-tab" data-active={tab.id === win.id}>
              <button
                className="frame-tab-name"
                role="tab"
                aria-selected={tab.id === win.id}
                title={tab.subtitle ? `${tab.title} — ${tab.subtitle}` : tab.title}
                onClick={() => onSelectTab?.(tab.id)}
                onDoubleClick={() => onPullOutTab?.(tab.id)}
              >
                {tab.title}
              </button>
              <button
                className="frame-tab-out"
                onClick={() => onPullOutTab?.(tab.id)}
                aria-label={`Move ${tab.title} to its own window`}
                title="Move to its own window"
              >
                ⧉
              </button>
              <button
                className="frame-tab-close"
                onClick={() => onCloseTab?.(tab.id)}
                aria-label={`Close ${tab.title}`}
                title="Close this tab"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {toolbar && <div className="frame-toolbar">{toolbar}</div>}

      <div className="frame-main">
        {sidebar}
        <div className="frame-body" data-fills={fills === true}>
          {children}
        </div>
        {inspector}
      </div>

      {!compact && (
        <button
          className="frame-resize"
          onPointerDown={startResize}
          aria-label={`Resize ${win.title}`}
          title="Drag to resize"
        />
      )}
    </section>
  );
}

interface Drag {
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
  width: number;
  /** How far across the frame it was picked up, in px. */
  grabX: number;
  /** The size it comes away at when it was snapped; null when it was not. */
  free: { width: number; height: number } | null;
  moved: boolean;
  last: { x: number; y: number } | null;
}

interface Resize {
  pointerX: number;
  pointerY: number;
  width: number;
  height: number;
  last: { width: number; height: number } | null;
}

const ZONES: { zone: Zone; label: string }[] = [
  { zone: 'left', label: 'Left half' },
  { zone: 'right', label: 'Right half' },
  { zone: 'fill', label: 'Whole screen' },
  { zone: 'top-left', label: 'Top left quarter' },
  { zone: 'top-right', label: 'Top right quarter' },
  { zone: 'bottom-left', label: 'Bottom left quarter' },
  { zone: 'bottom-right', label: 'Bottom right quarter' },
];

function SnapGlyph() {
  return (
    <svg width="15" height="12" viewBox="0 0 15 12" aria-hidden="true">
      <rect x="0.75" y="0.75" width="13.5" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.5" y="2.5" width="4.6" height="7" rx="0.8" fill="currentColor" />
    </svg>
  );
}
