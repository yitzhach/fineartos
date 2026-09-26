/**
 * Tiling: putting windows side by side instead of on top of one another.
 *
 * DOM-free and tested, like windows.ts. The shell asks for a zone or a
 * layout; this works out the rects, and React only draws them.
 *
 * The rules:
 *  - Snapping never loses the size a window was given by hand. It is kept in
 *    `restoreRect`, so Restore, a double click on the titlebar, or dragging
 *    the window away puts it back exactly as it was.
 *  - A tab group is one frame. It snaps, tiles and restores as one, the way it
 *    already moves and resizes as one.
 *  - Tiling respects the smallest a window can usefully be. When the screen
 *    cannot fit a row of columns that wide, the layout becomes a grid; when it
 *    cannot fit even that, the windows left over stack in the cells, visibly
 *    offset, rather than shrinking into something unreadable.
 *  - Minimised windows stay in the tray. They were put away on purpose.
 */

import {
  MIN_HEIGHT,
  MIN_WIDTH,
  cascadeRect,
  renderGroups,
  tabsOf,
  type Rect,
  type SnapZone,
  type WindowState,
} from './windows';

export type TileLayout = 'columns' | 'rows' | 'grid' | 'main';

/** A zone a single window can be snapped into: every one but a cell of a tiling. */
export type Zone = Exclude<SnapZone, 'tiled'>;

/** Clear of the desktop's edges: the same margins Fill the screen has always used. */
const SIDE = 12;
const TOP = 8;
/** Between two tiled windows. */
export const GAP = 8;

interface Viewport {
  width: number;
  height: number;
}

/** The part of the desktop a tiled window can use. */
function area(viewport: Viewport): Rect {
  return {
    x: SIDE,
    y: TOP,
    width: Math.max(0, viewport.width - SIDE * 2),
    height: Math.max(0, viewport.height - TOP * 2),
  };
}

/**
 * Cuts a rect into `n` equal parts with a gap between each. Whole pixels; the
 * last part takes the remainder so the row ends exactly at the edge.
 */
function split(rect: Rect, n: number, direction: 'across' | 'down'): Rect[] {
  if (n <= 0) return [];
  const total = direction === 'across' ? rect.width : rect.height;
  const size = Math.floor((total - GAP * (n - 1)) / n);
  return Array.from({ length: n }, (_, i) => {
    const start = i * (size + GAP);
    const length = i === n - 1 ? total - start : size;
    return direction === 'across'
      ? { x: rect.x + start, y: rect.y, width: length, height: rect.height }
      : { x: rect.x, y: rect.y + start, width: rect.width, height: length };
  });
}

/** The rect a zone covers on a desktop of this size. */
export function zoneRect(zone: Zone, viewport: Viewport): Rect {
  const a = area(viewport);
  if (zone === 'fill') return a;
  const [left, right] = split(a, 2, 'across') as [Rect, Rect];
  if (zone === 'left') return left;
  if (zone === 'right') return right;
  const column = zone.endsWith('left') ? left : right;
  const [top, bottom] = split(column, 2, 'down') as [Rect, Rect];
  return zone.startsWith('top') ? top : bottom;
}

/**
 * How near an edge a dragged window's pointer has to be to snap, and how far
 * along the edge from a corner still counts as that corner.
 */
export const EDGE = 12;
export const CORNER = 72;

/**
 * The zone a window dragged to this point would snap into, or null.
 *
 * The point is in the desktop's own coordinates and may be outside it — a
 * pointer pushed up into the system bar is still pushing at the top edge.
 * The bottom edge has no zone of its own: the dock lives there, and a window
 * dropped near the dock is a window being put down, not a request.
 */
export function zoneAt(point: { x: number; y: number }, viewport: Viewport): Zone | null {
  const { x, y } = point;
  const left = x <= EDGE;
  const right = x >= viewport.width - EDGE;
  const top = y <= EDGE;
  const nearTop = y <= CORNER;
  const nearBottom = y >= viewport.height - CORNER;

  if (top) {
    if (x <= CORNER) return 'top-left';
    if (x >= viewport.width - CORNER) return 'top-right';
    return 'fill';
  }
  if (left) return nearTop ? 'top-left' : nearBottom ? 'bottom-left' : 'left';
  if (right) return nearTop ? 'top-right' : nearBottom ? 'bottom-right' : 'right';
  return null;
}

export type Arrow = 'left' | 'right' | 'up' | 'down';

/**
 * What an arrow with the tiling keys does to a window, given where it is now.
 * The same walk as the big desktops: left then up is the top-left quarter,
 * the opposite arrow from a half puts it back, down from the whole screen
 * restores. `null` means the arrow does nothing from here.
 */
export function snapByArrow(current: SnapZone | null, arrow: Arrow): Zone | 'restore' | null {
  const table: Record<string, Partial<Record<Arrow, Zone | 'restore'>>> = {
    free: { left: 'left', right: 'right', up: 'fill' },
    tiled: { left: 'left', right: 'right', up: 'fill', down: 'restore' },
    fill: { left: 'left', right: 'right', down: 'restore' },
    left: { right: 'restore', up: 'top-left', down: 'bottom-left' },
    right: { left: 'restore', up: 'top-right', down: 'bottom-right' },
    'top-left': { right: 'top-right', up: 'fill', down: 'left' },
    'top-right': { left: 'top-left', up: 'fill', down: 'right' },
    'bottom-left': { right: 'bottom-right', up: 'left', down: 'restore' },
    'bottom-right': { left: 'bottom-left', up: 'right', down: 'restore' },
  };
  return table[current ?? 'free']?.[arrow] ?? null;
}

/** Every window in the same frame as this one: a group snaps as one. */
function familyOf(windows: WindowState[], id: string): Set<string> {
  return new Set(tabsOf(windows, id).map((w) => w.id));
}

/**
 * Puts a window (and its tabs) into a zone. The size it had by hand is kept
 * for later — and when it was already snapped, the size from before that,
 * so snapping twice does not forget the original.
 */
export function snapWindow(
  windows: WindowState[],
  id: string,
  zone: Zone,
  viewport: Viewport,
): WindowState[] {
  const family = familyOf(windows, id);
  if (family.size === 0) return windows;
  const rect = zoneRect(zone, viewport);
  return windows.map((w) =>
    family.has(w.id)
      ? { ...w, rect: { ...rect }, restoreRect: w.restoreRect ?? w.rect, snap: zone, minimized: false }
      : w,
  );
}

/** Back to the size and place it had by hand. A window never snapped is left alone. */
export function unsnapWindow(windows: WindowState[], id: string): WindowState[] {
  const family = familyOf(windows, id);
  return windows.map((w) =>
    family.has(w.id) && w.restoreRect
      ? { ...w, rect: w.restoreRect, restoreRect: null, snap: null }
      : w,
  );
}

/** Where `n` windows go in a layout. See `plan` for the fallback. */
export function tileRects(layout: TileLayout, n: number, viewport: Viewport): Rect[] {
  return plan(layout, n, viewport).rects;
}

/**
 * The rects for `n` windows, and the layout they actually got: a grid when
 * the one asked for would make windows narrower or shorter than they can be
 * used at.
 */
function plan(layout: TileLayout, n: number, viewport: Viewport): { used: TileLayout; rects: Rect[] } {
  if (n <= 0) return { used: layout, rects: [] };
  const a = area(viewport);
  if (n === 1) return { used: layout, rects: [a] };

  const columnsFit = (count: number, width: number) => (width - GAP * (count - 1)) / count >= MIN_WIDTH;
  const rowsFit = (count: number, height: number) => (height - GAP * (count - 1)) / count >= MIN_HEIGHT;

  if (layout === 'columns' && columnsFit(n, a.width)) return { used: layout, rects: split(a, n, 'across') };
  if (layout === 'rows' && rowsFit(n, a.height)) return { used: layout, rects: split(a, n, 'down') };
  if (layout === 'main' && columnsFit(2, a.width)) {
    // The main window takes most of the width; the rest share a column. The
    // column is never narrower than a window can be.
    const side = Math.max(MIN_WIDTH, Math.round(a.width * 0.38));
    const mainWidth = a.width - side - GAP;
    if (mainWidth >= MIN_WIDTH) {
      const main = { x: a.x, y: a.y, width: mainWidth, height: a.height };
      const column = { x: a.x + mainWidth + GAP, y: a.y, width: side, height: a.height };
      const rest = rowsFit(n - 1, column.height)
        ? split(column, n - 1, 'down')
        : gridIn(column, n - 1);
      return { used: layout, rects: [main, ...rest] };
    }
  }
  return { used: 'grid', rects: gridIn(a, n) };
}

/** How many columns a grid of `n` gets in this rect: as square as the width allows. */
function gridColumns(a: Rect, n: number): number {
  const maxCols = Math.max(1, Math.floor((a.width + GAP) / (MIN_WIDTH + GAP)));
  return Math.min(maxCols, Math.ceil(Math.sqrt(n)));
}

/**
 * A grid of `n` cells in a rect: as square as the room allows, the last row
 * stretched across so it has no holes. Past what fits at the smallest usable
 * size, windows share the cells, each one stepped down and right.
 */
function gridIn(a: Rect, n: number): Rect[] {
  const maxRows = Math.max(1, Math.floor((a.height + GAP) / (MIN_HEIGHT + GAP)));
  const cols = gridColumns(a, n);
  const rows = Math.min(maxRows, Math.ceil(n / cols));
  const capacity = cols * rows;
  const placed = Math.min(n, capacity);

  const cells: Rect[] = [];
  const bands = split(a, rows, 'down');
  bands.forEach((band, r) => {
    const inRow = r === rows - 1 ? placed - cols * (rows - 1) : cols;
    cells.push(...split(band, Math.max(1, inRow), 'across'));
  });

  const step = 28;
  return Array.from({ length: n }, (_, i) => {
    const cell = cells[i % capacity] ?? cells[cells.length - 1]!;
    const layer = Math.floor(i / capacity);
    if (layer === 0) return cell;
    const dx = Math.min(layer * step, Math.max(0, cell.width - MIN_WIDTH));
    const dy = Math.min(layer * step, Math.max(0, cell.height - MIN_HEIGHT));
    return { x: cell.x + dx, y: cell.y + dy, width: cell.width - dx, height: cell.height - dy };
  });
}

/** Centre of a rect, for putting frames in an order that matches where they are. */
function centre(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * The frames on screen, in the order a layout fills its cells. Where a
 * window already is decides where it goes — the one on the left stays on the
 * left — except in `main`, where the one in front takes the big cell.
 */
function orderFrames(
  frames: WindowState[],
  layout: TileLayout,
  frontId: string | null,
  viewport: Viewport,
): WindowState[] {
  const byX = (a: WindowState, b: WindowState) => centre(a.rect).x - centre(b.rect).x || a.z - b.z;
  const byY = (a: WindowState, b: WindowState) => centre(a.rect).y - centre(b.rect).y || byX(a, b);
  if (layout === 'columns') return [...frames].sort(byX);
  if (layout === 'rows') return [...frames].sort(byY);
  if (layout === 'main') {
    const front = frames.find((f) => f.id === frontId) ?? frames.reduce((top, f) => (f.z > top.z ? f : top));
    return [front, ...frames.filter((f) => f !== front).sort(byY)];
  }
  // Grid: reading order, top to bottom, then left to right along each row.
  const cols = gridColumns(area(viewport), frames.length);
  const sorted = [...frames].sort(byY);
  const out: WindowState[] = [];
  for (let i = 0; i < sorted.length; i += cols) out.push(...sorted.slice(i, i + cols).sort(byX));
  return out;
}

/** The frames drawn on screen now: one entry per group, minimised ones left out. */
export function visibleFrames(windows: WindowState[]): WindowState[] {
  return renderGroups(windows.filter((w) => !w.minimized)).map(({ active }) => active);
}

/**
 * Arranges the given frames (by the id of any window in each) into a layout.
 * Every window keeps the size it had by hand for Restore.
 */
export function tileFrames(
  windows: WindowState[],
  frameIds: string[],
  layout: TileLayout,
  viewport: Viewport,
  frontId: string | null = null,
): WindowState[] {
  const frames = visibleFrames(windows).filter((f) =>
    frameIds.some((id) => tabsOf(windows, id).some((w) => w.id === f.id)),
  );
  if (frames.length === 0) return windows;
  const { used, rects } = plan(layout, frames.length, viewport);
  const ordered = orderFrames(frames, used, frontId, viewport);

  const rectOf = new Map<string, Rect>();
  ordered.forEach((frame, i) => {
    const rect = rects[i];
    if (!rect) return;
    for (const w of tabsOf(windows, frame.id)) rectOf.set(w.id, rect);
  });

  return windows.map((w) => {
    const rect = rectOf.get(w.id);
    return rect
      ? { ...w, rect: { ...rect }, restoreRect: w.restoreRect ?? w.rect, snap: 'tiled' as const }
      : w;
  });
}

/** Every frame on screen, arranged. With fewer than two there is nothing to tile. */
export function tileAll(
  windows: WindowState[],
  layout: TileLayout,
  viewport: Viewport,
  frontId: string | null = null,
): WindowState[] {
  const frames = visibleFrames(windows);
  if (frames.length < 2) return windows;
  return tileFrames(windows, frames.map((f) => f.id), layout, viewport, frontId);
}

/** Puts every snapped, tiled or zoomed window back where it was put by hand. */
export function untileAll(windows: WindowState[]): WindowState[] {
  return windows.map((w) =>
    w.restoreRect ? { ...w, rect: w.restoreRect, restoreRect: null, snap: null } : w,
  );
}

export function anySnapped(windows: WindowState[]): boolean {
  return windows.some((w) => !w.minimized && w.restoreRect !== null);
}

/**
 * After the desktop changes size, snapped windows follow: a left half is
 * still a left half, and tiled windows are laid out again in the same order.
 */
export function resnap(windows: WindowState[], viewport: Viewport, layout: TileLayout): WindowState[] {
  let next = windows.map((w) =>
    w.snap && w.snap !== 'tiled' && !w.minimized ? { ...w, rect: zoneRect(w.snap, viewport) } : w,
  );
  const tiled = visibleFrames(next).filter((f) => f.snap === 'tiled');
  if (tiled.length > 0) {
    next = tileFrames(next, tiled.map((f) => f.id), layout, viewport);
  }
  return next;
}

/**
 * The classic stack: every frame at its own size, stepped down and right in
 * the order they are stacked, so each titlebar can be seen and grabbed.
 */
export function cascadeAll(windows: WindowState[], viewport: Viewport): WindowState[] {
  const frames = visibleFrames(windows).sort((a, b) => a.z - b.z);
  if (frames.length === 0) return windows;
  const rectOf = new Map<string, Rect>();
  frames.forEach((frame, i) => {
    const own = frame.restoreRect ?? frame.rect;
    const size = {
      width: Math.min(own.width, Math.max(MIN_WIDTH, viewport.width - 80)),
      height: Math.min(own.height, Math.max(MIN_HEIGHT, viewport.height - 80)),
    };
    const rect = cascadeRect(i, viewport, size);
    for (const w of tabsOf(windows, frame.id)) rectOf.set(w.id, rect);
  });
  return windows.map((w) => {
    const rect = rectOf.get(w.id);
    return rect ? { ...w, rect, restoreRect: null, snap: null } : w;
  });
}
