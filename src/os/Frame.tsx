import { useEffect, useRef, type ReactNode } from 'react';
import { isZoomed, MIN_HEIGHT, MIN_WIDTH, type WindowState } from './windows';

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
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  /**
   * Where the pointer is during a titlebar drag, in client coordinates, and
   * null the moment it is let go. The desktop uses it to work out whether
   * this window is being dropped onto another one as a tab.
   */
  onDragTo?: (point: { x: number; y: number } | null) => void;
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
  onMove,
  onResize,
  onDragTo,
  dropTarget,
  fills,
}: Props) {
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const resizeFrom = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (compact) return undefined;

    const move = (event: PointerEvent) => {
      if (dragFrom.current) {
        onMove(event.clientX - dragFrom.current.x, event.clientY - dragFrom.current.y);
        onDragTo?.({ x: event.clientX, y: event.clientY });
      } else if (resizeFrom.current) {
        const from = resizeFrom.current;
        onResize(
          Math.max(MIN_WIDTH, from.width + (event.clientX - from.x)),
          Math.max(MIN_HEIGHT, from.height + (event.clientY - from.y)),
        );
      }
    };
    const up = () => {
      // Told even when nothing was being dragged: the desktop clears its drop
      // target on any pointer up, which is one less way to leave it stuck on.
      if (dragFrom.current) onDragTo?.(null);
      dragFrom.current = null;
      resizeFrom.current = null;
    };

    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', up);
    return () => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', up);
    };
  }, [compact, onDragTo, onMove, onResize]);

  const startDrag = (event: React.PointerEvent) => {
    onFocus();
    if (compact || isZoomed(win)) return;
    // Ignore drags that start on a control in the titlebar.
    if ((event.target as HTMLElement).closest('button')) return;
    dragFrom.current = { x: event.clientX - win.rect.x, y: event.clientY - win.rect.y };
  };

  const startResize = (event: React.PointerEvent) => {
    event.stopPropagation();
    onFocus();
    resizeFrom.current = {
      x: event.clientX,
      y: event.clientY,
      width: win.rect.width,
      height: win.rect.height,
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
