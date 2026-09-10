import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadLayout, saveLayout, type WindowLayout } from '../lib/prefs';

interface Props {
  title: string;
  toolbar: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

/**
 * One draggable document window. Position, maximised state and the drag lock
 * persist across sessions.
 *
 * Below 860px the stylesheet lays this out as a static full-width panel and
 * dragging is disabled, so a phone never has to move a window to read it.
 */
export function AppWindow({ title, toolbar, children, onClose }: Props) {
  const [layout, setLayout] = useState<WindowLayout>(loadLayout);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const isCompact = () => window.matchMedia('(max-width: 860px)').matches;

  useEffect(() => saveLayout(layout), [layout]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragOffset.current) return;
      setLayout((current) => ({
        ...current,
        x: Math.max(0, event.clientX - dragOffset.current!.x),
        y: Math.max(0, event.clientY - dragOffset.current!.y),
      }));
    };
    const up = () => {
      dragOffset.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const startDrag = (event: React.PointerEvent) => {
    if (layout.locked || layout.maximized || isCompact()) return;
    dragOffset.current = { x: event.clientX - layout.x, y: event.clientY - layout.y };
  };

  return (
    <div
      className="window"
      data-maximized={layout.maximized}
      style={{ left: layout.x, top: layout.y }}
      role="dialog"
      aria-label={title}
    >
      <div className="titlebar" data-locked={layout.locked} onPointerDown={startDrag}>
        <span className="title">{title}</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button
          className="btn"
          data-variant="quiet"
          onClick={() => setLayout((c) => ({ ...c, locked: !c.locked }))}
          aria-pressed={layout.locked}
          title={layout.locked ? 'Unlock the window position' : 'Lock the window position'}
        >
          {layout.locked ? 'Locked' : 'Lock'}
        </button>
        <button
          className="btn"
          data-variant="quiet"
          onClick={() => setLayout((c) => ({ ...c, maximized: !c.maximized }))}
          aria-pressed={layout.maximized}
        >
          {layout.maximized ? 'Restore' : 'Maximize'}
        </button>
        <button className="btn" data-variant="quiet" onClick={onClose} aria-label="Close window">
          ✕
        </button>
      </div>

      <div className="toolbar">{toolbar}</div>
      <div className="window-body">{children}</div>
    </div>
  );
}
