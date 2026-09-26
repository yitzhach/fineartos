import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { CommissionDocument } from '../commission/types';
import type { Invoice } from '../invoice/types';
import type { Photo } from '../photo/photo';
import { describePhoto } from '../photo/photo';
import type { Project } from '../project/project';
import { projectItemCount } from '../project/project';
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  clampToDesktop,
  firstFreeSlot,
  iconAt,
  resolveLayout,
  settledPositions,
  snapToGrid,
  trashPositionOf,
  type DesktopLayout,
  type IconPosition,
  type Viewport,
} from './desktopLayout';

export type DesktopItem =
  | { kind: 'project'; id: string; project: Project }
  | { kind: 'document'; id: string; document: CommissionDocument }
  | { kind: 'invoice'; id: string; invoice: Invoice }
  | { kind: 'photo'; id: string; photo: Photo };

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
  onNewFolder: () => void;
  /** The Coming up panel, drawn on the desktop's right. */
  panel?: ReactNode;
  /** What ⌘Z would put back, or null when there is nothing to undo. */
  undoLabel: string | null;
  onUndo: () => void;
  /** Files chosen or dropped on the Add images square. */
  onAddImages: (files: FileList | File[]) => void;
  /** True while an import is running, so the square can say so. */
  importing: boolean;
  onTidy: () => void;
  /** How many things are in the Trash, so the icon can look full. */
  trashCount: number;
  /** Where the artist has left the can. Null means it has never been moved. */
  trashPosition: IconPosition | null;
  onMoveTrash: (position: IconPosition) => void;
  /** Moves something to the Trash. Nothing is deleted by this. */
  onTrash: (id: string) => void;
  onOpenTrash: () => void;
  /** Reports the surface's own size, so Tidy up arranges to the same grid. */
  onViewport: (viewport: Viewport) => void;
}

/** The id the Trash goes by while working out what a drop landed on. */
const TRASH_ID = '__trash';

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
  const { items, imageUrls } = props;
  const surfaceRef = useRef<HTMLDivElement>(null);

  /**
   * The layout is worked out against the surface the icons are drawn into,
   * which is shorter than the window: the system bar sits above it. Measuring
   * rather than assuming keeps the bottom row clear of the dock at any size.
   */
  const [measured, setMeasured] = useState<Viewport | null>(null);
  const viewport = measured ?? props.viewport;
  const { onViewport } = props;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const size = {
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      };
      setMeasured((current) =>
        current && current.width === size.width && current.height === size.height ? current : size,
      );
      onViewport(size);
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [onViewport]);

  const ids = items.map((item) => item.id);
  // Three steps, in this order, so the answer is the same every render:
  // the icons the artist placed go where they were put; the Trash takes a
  // spot clear of them; then everything without a home fills the gaps,
  // stepping over the Trash rather than landing on it.
  const settled = settledPositions(ids, props.layout, viewport);
  const trash = trashPositionOf(props.trashPosition, viewport, settled);
  const resolved = resolveLayout(ids, props.layout, viewport, [trash]);
  const targets = { ...resolved, [TRASH_ID]: trash };

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
  const draggingTrash = drag?.id === TRASH_ID && drag.moved;
  const trashAt = draggingTrash ? { x: drag.x, y: drag.y } : trash;

  const hovering =
    drag && drag.moved && drag.id !== TRASH_ID
      ? iconAt(targets, { x: drag.x + CELL_WIDTH / 2, y: drag.y + CELL_HEIGHT / 2 }, drag.id)
      : null;
  const overTrash = hovering === TRASH_ID;
  const overFolder = dragIsFolder || overTrash ? null : hovering;
  const overIsFolder =
    overFolder !== null && items.some((i) => i.id === overFolder && i.kind === 'project');

  /** The Add images square sits after whatever the artist has arranged. */
  const addTile = firstFreeSlot(targets, viewport);

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
          const target = iconAt(targets, centre, current.id);
          const targetIsFolder = items.some((i) => i.id === target && i.kind === 'project');
          const sourceIsFolder = items.some((i) => i.id === current.id && i.kind === 'project');

          if (current.id === TRASH_ID) {
            // The can itself was being carried: it lands like any icon, and
            // nothing is filed or binned by moving it.
            props.onMoveTrash(clampToDesktop(snapToGrid(current.x, current.y), viewport));
          } else if (target === TRASH_ID) {
            props.onTrash(current.id);
          } else if (target && targetIsFolder && !sourceIsFolder) {
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
    // `targets` and `items` are read inside `up`; re-binding on each change
    // keeps the drop decision working off current data rather than a snapshot
    // taken when the drag began.
  }, [drag?.id, targets, items, viewport, props]);

  return (
    <div
      className="desktop-surface"
      ref={surfaceRef}
      onClick={() => props.onSelect(null)}
    >
      {props.panel}
      <div className="desktop-tools no-print">
        <button className="btn" data-variant="quiet" onClick={(e) => { e.stopPropagation(); props.onNewFolder(); }}>
          New project folder
        </button>
        <button className="btn" data-variant="quiet" onClick={(e) => { e.stopPropagation(); props.onTidy(); }}>
          Tidy up
        </button>
        {/* Named, so it is obvious what is about to be put back. ⌘Z does the
            same thing from anywhere; this is for the artist who never learnt
            the shortcut, and it is where a mistake is usually noticed. */}
        <button
          className="btn"
          data-variant="quiet"
          disabled={props.undoLabel === null}
          title={props.undoLabel ? `Undo: ${props.undoLabel}` : 'Nothing to undo'}
          onClick={(e) => {
            e.stopPropagation();
            props.onUndo();
          }}
        >
          Undo
        </button>
        {/* The keyboard and small-screen route to the Trash, for anyone not
            dragging. Disabled rather than hidden, so its place is learnable. */}
        <button
          className="btn"
          data-variant="quiet"
          disabled={props.selectedId === null}
          onClick={(e) => {
            e.stopPropagation();
            if (props.selectedId) props.onTrash(props.selectedId);
          }}
        >
          Move to Trash
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
            onTrash={props.onTrash}
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

      {/* Bottom right, where it has been on every desktop since 1984. */}
      <button
        className="desktop-icon trash"
        data-drop-target={overTrash}
        data-dragging={Boolean(draggingTrash)}
        data-full={props.trashCount > 0}
        style={{ left: trashAt.x, top: trashAt.y }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          const surface = surfaceRef.current?.getBoundingClientRect();
          if (!surface) return;
          setDrag({
            id: TRASH_ID,
            x: trash.x,
            y: trash.y,
            offsetX: e.clientX - surface.left - trash.x,
            offsetY: e.clientY - surface.top - trash.y,
            moved: false,
          });
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          props.onOpenTrash();
        }}
        title="Trash — drag things here, drag the can to move it, double-click to open"
      >
        <span className="thumb trash-can" aria-hidden="true">
          <span className="can" />
        </span>
        <span className="label">Trash</span>
        {props.trashCount > 0 && (
          <span className="caption">
            {props.trashCount} {props.trashCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </button>

      {/* Last, so it sits after whatever the artist has arranged. New
          commission lives in the dock now, where the other verbs are. */}
      <AddImages
        position={addTile}
        importing={props.importing}
        onFiles={props.onAddImages}
      />
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
  onTrash,
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
  onTrash: (id: string) => void;
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
        // Delete moves to the Trash; it does not delete. Emptying the Trash
        // is the only thing in this app that destroys a record.
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onTrash(item.id);
        }
      }}
      title={`${name} — double-click to open, drag to move, Delete to bin`}
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

  if (item.kind === 'photo') {
    return {
      name: item.photo.title,
      caption: describePhoto(item.photo),
      thumbId: item.photo.imageId,
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


/**
 * The Add images square: a file picker and a drop target in one tile.
 *
 * External files arrive through the HTML5 drag events — the only way a
 * browser hands over a file — while icons on the desktop are dragged with
 * pointer events. The two never meet, so dropping a file cannot be mistaken
 * for filing an icon.
 */
function AddImages({
  position,
  importing,
  onFiles,
}: {
  position: { x: number; y: number };
  importing: boolean;
  onFiles: (files: FileList | File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className="desktop-icon add-images"
      data-over={over}
      data-busy={importing}
      style={{ left: position.x, top: position.y }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
    >
      <button
        className="add-images-hit"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        title="Add images — click to choose a file, or drop files here"
      >
        <span className="thumb blank" aria-hidden="true">
          <span className="plus">{importing ? '…' : '＋'}</span>
        </span>
        <span className="label">{importing ? 'Adding…' : 'Add images'}</span>
        <span className="caption">click or drop a file</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
