import { Fragment, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { groupOf, listModules, type OsModule } from './registry';

interface Props {
  activeId: string;
  onOpen: (id: string) => void;
  /**
   * The room the dock takes at the bottom of the screen, measured. The
   * desktop keeps its icons clear of it — windows, on the other hand, are
   * allowed to pass underneath, the way they do on a real desktop.
   */
  onHeight?: (height: number) => void;
}

/**
 * The dock magnifies toward the pointer, the way a desktop dock does, and
 * sits small the rest of the time so it stays out of the work.
 *
 * The scale is computed from the pointer's distance to each item's centre
 * rather than from a per-item hover, so neighbours rise together instead of
 * one item popping on its own.
 *
 * Two things are deliberate: magnification is off under a coarse pointer (a
 * finger has no hover, and a target that grows under the thumb is worse than
 * a still one), and it is off under prefers-reduced-motion.
 */
const MAX_SCALE = 1.42;
/**
 * How far from an item's centre the pointer still lifts it, in px. The swell
 * is the same height as it always was; the reach is what sets how fast it
 * arrives, because the lift is a function of the distance across it. Widened
 * from 132 so the same movement of the mouse grows a tile about 30% more
 * slowly — it read as a pop before.
 */
const REACH = 189;

export function Dock({ activeId, onOpen, onHeight }: Props) {
  const [pointerX, setPointerX] = useState<number | null>(null);
  const frame = useRef<number | null>(null);
  const dockRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || !onHeight || typeof ResizeObserver === 'undefined') return undefined;
    // The layout height, which a transform does not change: the dock shrinks
    // to 0.72 at rest, and the room it keeps is the room it needs at full size.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) onHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [onHeight]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  /**
   * At rest the dock sits smaller and lower, the way a desktop dock does, so
   * it takes less of the screen while the artist is working. It comes up to
   * full size when the pointer is anywhere near it.
   *
   * Only with a mouse: a finger has no hover, so on a phone or tablet the
   * dock stays at full size and full target area, which is what a thumb
   * needs. Reduced motion keeps it up too, rather than animating at every
   * pass of the pointer.
   */
  const [near, setNear] = useState(false);

  const magnifies =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false) &&
    !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  const rests = magnifies && !near;

  return (
    <div className="dock-slot">
    <nav
      ref={dockRef}
      className="dock"
      aria-label="Applications"
      data-resting={rests}
      onPointerEnter={() => setNear(true)}
      onFocusCapture={() => setNear(true)}
      onBlurCapture={() => setNear(false)}
      onPointerMove={(e) => {
        // One update per animation frame. Setting state on every pointermove
        // queued several renders per frame, which is what made the swell look
        // like it was stepping rather than flowing.
        if (!magnifies || e.pointerType !== 'mouse') return;
        const x = e.clientX;
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          setPointerX(x);
        });
      }}
      onPointerLeave={() => {
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
        setPointerX(null);
        setNear(false);
      }}
    >
      {listModules().map((module, index, all) => {
        // A rule between groups: what works, what is coming later, and the
        // Trash. Without it the dimmed previews read as a gap in the row.
        const previous = index > 0 ? all[index - 1] : undefined;
        const divides = previous !== undefined && groupOf(previous) !== groupOf(module);
        return (
          <Fragment key={module.id}>
            {divides && <span className="dock-divider" aria-hidden="true" />}
            <DockItem
              module={module}
              active={activeId === module.id}
              pointerX={magnifies ? pointerX : null}
              onOpen={onOpen}
            />
          </Fragment>
        );
      })}
    </nav>
    </div>
  );
}

function DockItem({
  module,
  active,
  pointerX,
  onOpen,
}: {
  module: OsModule;
  active: boolean;
  pointerX: number | null;
  onOpen: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  let scale = 1;
  if (pointerX !== null && ref.current) {
    const box = ref.current.getBoundingClientRect();
    const distance = Math.abs(pointerX - (box.left + box.width / 2));
    if (distance < REACH) {
      // Cosine falloff: full lift at the centre, easing to nothing at the edge.
      const t = 1 - distance / REACH;
      scale = 1 + (MAX_SCALE - 1) * (0.5 - Math.cos(Math.PI * t) / 2);
    }
  }

  return (
    <button
      ref={ref}
      className="dock-item"
      aria-current={active}
      disabled={!module.available}
      onClick={() => module.available && onOpen(module.id)}
      title={module.available ? module.name : `${module.name} — coming later`}
      style={{ '--dock-scale': scale } as React.CSSProperties}
    >
      <span className="tile">
        <Icon name={module.icon} />
      </span>
      {/* Labels are always visible, the way a desktop dock shows them. A row
          of unexplained glyphs is not a dock, it is a puzzle. A tool that is
          not built yet says so in its tooltip rather than in a line of its
          own: the line cost every item in the row the space under it. */}
      <span className="name">{module.name}</span>
      <span className="dot" data-on={active} aria-hidden="true" />
    </button>
  );
}
