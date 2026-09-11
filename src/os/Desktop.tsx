import { useEffect, useRef, useState } from 'react';
import type { CommissionDocument } from '../commission/types';
import type { Invoice } from '../invoice/types';
import type { Project } from '../project/project';
import { projectItemCount } from '../project/project';
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  clampToDesktop,
  firstFreeSlot,
  iconAt,
  resolveLayout,
  snapToGrid,
  type DesktopLayout,
  type Viewport,
} from './desktopLayout';

export type DesktopItem =
  | { kind: 'project'; id: string; project: Project }
  | { kind: 'document'; id: string; document: CommissionDocument }
  | { kind: 'invoice'; id: string; invoice: Invoice };

interface Props {
  items: DesktopItem[];
  /** Object URLs by image id, for thumbnails. A missing id draws no frame. */
  imageUrls: Record<string, string>;
  layout: DesktopLayout;
  viewport: Viewport;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (item: DesktopItem) => void;
  onMove: (id: string, position: { x: number; y: number }) => void;
  /** A file dragged onto a folder is filed into it. */
  onFileInto: (folderId: string, itemId: string) => void;
  onNew: () => void;
  onNewFolder: () => void;
  onTidy: () => void;
}

/**
 * The desktop: icons you can pick up and put where you like.
 *
 * Dragging is pointer-based rather than HTML5 drag-and-drop, because HTML5
 * drag gives no usable position while the drag is in flight and cannot be
 * made to snap. The rules it follows are in desktopLayout.ts, tested apart
 * from the DOM.
 *
 * One click selects, two open — the thing every desktop has done for forty
 * years. Dropping one icon onto a folder files it there.
 */
export function Desktop(props: Props) {
  const { items, imageUrls, viewport } = props;
  const surfaceRef = useRef<HTMLDivElement>(null);

  const ids = items.map((item) => item.id);
  const resolved = resolveLayout(ids, props.layout, viewport);

  // While dragging, this icon follows the pointer instead of its stored spot.
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  // Which folder the pointer is currently over, so it can light up.
  // A folder cannot go into a folder: nesting projects is not something this
  // app models, and a folder that swallowed another would lose it.
  const dragIsFolder = items.some((i) => i.id === drag?.id && i.kind === 'project');
  const overFolder =
    drag && drag.moved && !dragIsFolder
      ? iconAt(resolved, { x: drag.x + CELL_WIDTH / 2, y: drag.y + CELL_HEIGHT / 2 }, drag.id)
      : null;
  const overIsFolder =
    overFolder !== null && items.some((i) => i.id === overFolder && i.kind === 'project');

  /** The "New commission" tile sits after whatever the artist has arranged. */
  const newTile = firstFreeSlot(resolved, viewport);

  useEffect(() => {
    if (!drag) return undefined;

    const move = (event: PointerEvent) => {
      const surface = surfaceRef.current?.getBoundingClientRect();
      if (!surface) return;
      setDrag((current) =>
        current
          ? {
              ...current,
              x: event.clientX - surface.left - current.offsetX,
              y: event.clientY - surface.top - current.offsetY,
              moved: true,
            }
          : current,
      );
    };

    const up = () => {
      setDrag((current) => {
        if (!current) return null;
        // A click that never moved is a selection, not a drag.
        if (current.moved) {
          const centre = { x: current.x + CELL_WIDTH / 2, y: current.y + CELL_HEIGHT / 2 };
          const target = iconAt(resolved, centre, current.id);
          const targetIsFolder = items.some((i) => i.id === target && i.kind === 'project');
          const sourceIsFolder = items.some((i) => i.id === current.id && i.kind === 'project');

          if (target && targetIsFolder && !sourceIsFolder) {
            props.onFileInto(target, current.id);
          } else {
            props.onMove(current.id, clampToDesktop(snapToGrid(current.x, current.y), viewport));
          }
        }
        return null;
      });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // `resolved` and `items` are read inside `up`; re-binding on each change
    // keeps the drop decision working off current data rather than a snapshot
    // taken when the drag began.
  }, [drag?.id, resolved, items, viewport, props]);

  return (
    <div
      className="desktop-surface"
      ref={surfaceRef}
      onClick={() => props.onSelect(null)}
    >
      <div className="desktop-tools no-print">
        <button className="btn" data-variant="quiet" onClick={(e) => { e.stopPropagation(); props.onNewFolder(); }}>
          New folder
        </button>
        <button className="btn" data-variant="quiet" onClick={(e) => { e.stopPropagation(); props.onTidy(); }}>
          Tidy up
        </button>
      </div>

      {items.map((item) => {
        const dragging = drag?.id === item.id && drag.moved;
        const position = dragging
          ? { x: drag.x, y: drag.y }
          : resolved[item.id] ?? { x: 0, y: 0 };

        return (
          <Icon
            key={item.id}
            item={item}
            imageUrls={imageUrls}
            position={position}
            dragging={Boolean(dragging)}
            dropTarget={overIsFolder && overFolder === item.id}
            selected={props.selectedId === item.id}
            onSelect={props.onSelect}
            onOpen={props.onOpen}
            onDragStart={(event) => {
              const surface = surfaceRef.current?.getBoundingClientRect();
              const spot = resolved[item.id];
              if (!surface || !spot) return;
              setDrag({
                id: item.id,
                x: spot.x,
                y: spot.y,
                offsetX: event.clientX - surface.left - spot.x,
                offsetY: event.clientY - surface.top - spot.y,
                moved: false,
              });
            }}
          />
        );
      })}

      {/* Always last, so it sits after whatever the artist has arranged. */}
      <button
        className="desktop-icon new"
        style={{ left: newTile.x, top: newTile.y }}
        onClick={(e) => {
          e.stopPropagation();
          props.onNew();
        }}
      >
        <span className="thumb blank" aria-hidden="true">
          <span className="plus">+</span>
        </span>
        <span className="label">New commission</span>
      </button>
    </div>
  );
}

function Icon({
  item,
  imageUrls,
  position,
  dragging,
  dropTarget,
  selected,
  onSelect,
  onOpen,
  onDragStart,
}: {
  item: DesktopItem;
  imageUrls: Record<string, string>;
  position: { x: number; y: number };
  dragging: boolean;
  dropTarget: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (item: DesktopItem) => void;
  onDragStart: (event: React.PointerEvent) => void;
}) {
  const { name, caption, thumbId, badge } = describe(item);
  const url = thumbId ? imageUrls[thumbId] : undefined;

  return (
    <button
      className="desktop-icon"
      data-kind={item.kind}
      data-selected={selected}
      data-dragging={dragging}
      data-drop-target={dropTarget}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(item.id);
        if (e.button === 0) onDragStart(e);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      title={`${name} — double-click to open, drag to move`}
    >
      <span className={`thumb ${item.kind}`} aria-hidden="true">
        {url ? (
          <img src={url} alt="" draggable={false} />
        ) : item.kind === 'project' ? (
          <span className="folder-face" />
        ) : (
          <span className="sheet-face" />
        )}
        {badge && <span className="kind-badge">{badge}</span>}
      </span>
      <span className="label">{name}</span>
      {caption && <span className="caption">{caption}</span>}
    </button>
  );
}

function describe(item: DesktopItem): {
  name: string;
  caption: string | null;
  thumbId: string | null;
  badge: string | null;
} {
  if (item.kind === 'project') {
    const count = projectItemCount(item.project);
    return {
      name: item.project.name,
      caption: count === 1 ? '1 item' : `${count} items`,
      thumbId: item.project.coverImageId,
      badge: null,
    };
  }

  if (item.kind === 'invoice') {
    return {
      name: item.invoice.invoiceNumber,
      caption: item.invoice.client.name.trim() || 'No client set',
      thumbId: null,
      badge: 'INV',
    };
  }

  const doc = item.document;
  return {
    name: doc.title.trim() || doc.documentNumber,
    caption: doc.client.name.trim() || 'No client set',
    // The first reference image is the project's face. Nothing is invented
    // when there is no image: the icon draws a plain sheet instead.
    thumbId: doc.artwork.referenceImageIds[0] ?? null,
    badge: doc.isDemo ? 'DEMO' : null,
  };
}
