import { useRef, useState } from 'react';
import { listModules, type OsModule } from './registry';

interface Props {
  activeId: string;
  onOpen: (id: string) => void;
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
const MAX_SCALE = 1.5;
const REACH = 100; // px from an item's centre at which magnification fades out

export function Dock({ activeId, onOpen }: Props) {
  const [pointerX, setPointerX] = useState<number | null>(null);

  const magnifies =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false) &&
    !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  return (
    <nav
      className="dock"
      aria-label="Applications"
      onPointerMove={(e) => {
        if (magnifies && e.pointerType === 'mouse') setPointerX(e.clientX);
      }}
      onPointerLeave={() => setPointerX(null)}
    >
      {listModules().map((module) => (
        <DockItem
          key={module.id}
          module={module}
          active={activeId === module.id}
          pointerX={magnifies ? pointerX : null}
          onOpen={onOpen}
        />
      ))}
    </nav>
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
      {/* The label rides above the tile on hover, like a dock tooltip, so the
          dock stays compact without becoming a row of mystery glyphs. */}
      <span className="tip" aria-hidden="true">
        {module.name}
        {!module.available && <em> · coming later</em>}
      </span>
      <span className="tile">
        <span className="glyph" aria-hidden="true">{module.icon}</span>
      </span>
      <span className="sr-only">
        {module.name}
        {!module.available && ' — coming later'}
      </span>
      <span className="dot" data-on={active} aria-hidden="true" />
    </button>
  );
}
