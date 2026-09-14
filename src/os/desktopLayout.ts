/**
 * Where things sit on the desktop.
 *
 * DOM-free and tested, like the window manager: the arithmetic of snapping,
 * tidying and finding a free slot is worked out here, and the React layer only
 * draws the result.
 *
 * The rules:
 *  - An icon the artist has placed stays where they put it. Auto-arrange is
 *    something they ask for, never something that happens to them.
 *  - An icon that has never been placed gets the first free slot, scanning
 *    down then across, the way a desktop fills up.
 *  - Positions are snapped to a grid, because hand-dragged icons that are
 *    three pixels out of line look like a mistake rather than a choice.
 *  - Nothing can be dropped where it cannot be reached again.
 */

export interface IconPosition {
  x: number;
  y: number;
}

export type DesktopLayout = Record<string, IconPosition>;

/**
 * One grid cell. Matches the icon size in the stylesheet, which is the point:
 * the cell was 116 while an icon with a two-line label rendered 123 tall, so
 * every row overlapped the one below it by seven pixels and the bottom of a
 * column sat on the Trash. The icon is now a fixed 118 and the cell leaves it
 * air.
 */
export const CELL_WIDTH = 116;
export const CELL_HEIGHT = 130;

/**
 * Clear of the edges. Everything here is measured against the desktop surface,
 * not the window: the surface starts below the system bar and ends above the
 * dock, which is why Desktop measures its own box rather than assuming. The
 * bottom margin is only an icon's label plus air.
 */
export const MARGIN_TOP = 16;
export const MARGIN_LEFT = 16;
export const MARGIN_BOTTOM = 40;

export interface Viewport {
  width: number;
  height: number;
}

export function snapToGrid(x: number, y: number): IconPosition {
  return {
    x: Math.max(0, Math.round((x - MARGIN_LEFT) / CELL_WIDTH) * CELL_WIDTH + MARGIN_LEFT),
    y: Math.max(0, Math.round((y - MARGIN_TOP) / CELL_HEIGHT) * CELL_HEIGHT + MARGIN_TOP),
  };
}

/** Keeps an icon on screen and out from under the dock. */
export function clampToDesktop(position: IconPosition, viewport: Viewport): IconPosition {
  const maxX = Math.max(MARGIN_LEFT, viewport.width - CELL_WIDTH - MARGIN_LEFT);
  const maxY = Math.max(MARGIN_TOP, viewport.height - CELL_HEIGHT - MARGIN_BOTTOM);
  return {
    x: Math.min(Math.max(MARGIN_LEFT, position.x), maxX),
    y: Math.min(Math.max(MARGIN_TOP, position.y), maxY),
  };
}

/** How many icons fit down one column before it wraps to the next. */
export function rowsPerColumn(viewport: Viewport): number {
  const usable = viewport.height - MARGIN_TOP - MARGIN_BOTTOM;
  return Math.max(1, Math.floor(usable / CELL_HEIGHT));
}

/** The nth slot, filling down the first column, then the next. */
export function slotPosition(index: number, viewport: Viewport): IconPosition {
  const rows = rowsPerColumn(viewport);
  const column = Math.floor(index / rows);
  const row = index % rows;
  return {
    x: MARGIN_LEFT + column * CELL_WIDTH,
    y: MARGIN_TOP + row * CELL_HEIGHT,
  };
}

/**
 * Where the Trash starts: the bottom of the first column, out of the way of
 * the icons, which fill from the top down. It can be dragged anywhere from
 * there, and where the artist leaves it is remembered — so this is a default,
 * not a rule.
 *
 * On the grid on purpose. It used to sit at `height − cell − margin`, which is
 * a few pixels off every real slot, so the collision checks — which compared
 * positions exactly — never saw it, and the icons filling the first column
 * eventually landed on top of it.
 */
export function defaultTrashSlot(viewport: Viewport, taken: IconPosition[] = []): IconPosition {
  const rows = rowsPerColumn(viewport);
  const bottom = Math.max(0, rows - 1);
  const free = (spot: IconPosition) => !taken.some((one) => overlaps(one, spot));

  // The Trash is the one thing here whose home depends on the size of the
  // window, so when a window shrinks onto an icon it is the Trash that gives
  // way rather than the work. Bottom left first, then up the column, then
  // along the bottom of the columns to the right — a short window can have a
  // first column with no room in it at all.
  for (let row = bottom; row >= 0; row -= 1) {
    const candidate = slotPosition(row, viewport);
    if (free(candidate)) return candidate;
  }
  for (let column = 1; column < 40; column += 1) {
    const candidate = slotPosition(column * rows + bottom, viewport);
    if (free(candidate)) return candidate;
  }
  return slotPosition(bottom, viewport);
}

/**
 * Where the Trash actually is. A remembered position is clamped like any
 * other icon, so a can left in the corner of a large screen is still
 * reachable on a small one.
 */
export function trashPositionOf(
  saved: IconPosition | null,
  viewport: Viewport,
  /** Where the icons already are, so a default does not land on one. */
  taken: IconPosition[] = [],
): IconPosition {
  // A position the artist chose is kept even if something is on it: they put
  // it there. Only the default gets out of the way.
  return saved ? clampToDesktop(saved, viewport) : defaultTrashSlot(viewport, taken);
}

/**
 * Whether two icons would sit on top of each other.
 *
 * Overlap rather than an exact match: clamping to a small screen can leave an
 * icon a few pixels off the grid, and an icon that misses another one's
 * position by three pixels is still covering it. Exact comparison is what let
 * the Trash disappear under a picture.
 */
export function overlaps(a: IconPosition, b: IconPosition): boolean {
  return Math.abs(a.x - b.x) < CELL_WIDTH && Math.abs(a.y - b.y) < CELL_HEIGHT;
}

function occupies(layout: DesktopLayout, position: IconPosition, ignoreId?: string): boolean {
  return Object.entries(layout).some(([id, placed]) => id !== ignoreId && overlaps(placed, position));
}

/**
 * The first slot nothing is already sitting in. Used when a new project
 * appears: dropping it on top of an existing icon would hide one of them.
 */
export function firstFreeSlot(layout: DesktopLayout, viewport: Viewport): IconPosition {
  // Bounded: a desktop cannot have more slots than a few screens' worth, and
  // an unbounded loop here would hang the app rather than misplace an icon.
  const limit = Math.max(1, rowsPerColumn(viewport)) * 40;
  for (let index = 0; index < limit; index += 1) {
    const candidate = slotPosition(index, viewport);
    if (!occupies(layout, candidate)) return candidate;
  }
  return slotPosition(0, viewport);
}

/**
 * The icons that will certainly stay where they are: placed by the artist and
 * still on screen at this size. Everything else — clamped back on, or never
 * placed at all — is going to be given a spot, so it is those the Trash's
 * default has to keep clear of.
 */
export function settledPositions(
  ids: string[],
  layout: DesktopLayout,
  viewport: Viewport,
): IconPosition[] {
  const settled: IconPosition[] = [];
  for (const id of ids) {
    const existing = layout[id];
    if (!existing) continue;
    const clamped = clampToDesktop(existing, viewport);
    if (clamped.x === existing.x && clamped.y === existing.y) settled.push(existing);
  }
  return settled;
}

/**
 * Gives every id a position, leaving placed icons alone and slotting the rest
 * into the gaps. This runs on every render, so it must not reshuffle icons
 * that already have a home.
 */
export function resolveLayout(
  ids: string[],
  layout: DesktopLayout,
  viewport: Viewport,
  /** Places nothing may be auto-placed on. The Trash, in practice. */
  blocked: IconPosition[] = [],
): DesktopLayout {
  const resolved: DesktopLayout = {};
  const placed: DesktopLayout = {};
  // Held in the same map the free-slot scan reads, so a blocked spot is
  // simply a spot that is taken. An icon the artist dragged there themselves
  // is left where they put it — that was a choice, not an accident.
  for (const [index, spot] of blocked.entries()) placed[`blocked-${index}`] = spot;

  /**
   * Two passes over the icons the artist has placed.
   *
   * An icon that still fits keeps its spot, always — that was a choice, and
   * this includes one deliberately dropped on top of something else. An icon
   * the clamp had to drag back on screen has already been moved by the app,
   * so it takes a free slot rather than landing on a neighbour: shrinking the
   * window used to pile a whole column onto the last row.
   *
   * The stored layout is never rewritten here, so making the window big again
   * puts everything back exactly where it was left.
   */
  const fits: string[] = [];
  const shifted: string[] = [];
  for (const id of ids) {
    const existing = layout[id];
    if (!existing) continue;
    const clamped = clampToDesktop(existing, viewport);
    (clamped.x === existing.x && clamped.y === existing.y ? fits : shifted).push(id);
  }

  for (const id of fits) {
    const position = layout[id]!;
    resolved[id] = position;
    placed[id] = position;
  }

  for (const id of shifted) {
    const clamped = clampToDesktop(layout[id]!, viewport);
    const position = occupies(placed, clamped) ? firstFreeSlot(placed, viewport) : clamped;
    resolved[id] = position;
    placed[id] = position;
  }

  for (const id of ids) {
    if (resolved[id]) continue;
    const position = firstFreeSlot(placed, viewport);
    resolved[id] = position;
    placed[id] = position;
  }

  return resolved;
}

/**
 * Tidies everything into columns, in the order given. Unlike `resolveLayout`
 * this deliberately overrides hand-placed icons — it is what the artist asked
 * for when they chose Tidy up.
 */
export function autoArrange(
  ids: string[],
  viewport: Viewport,
  blocked: IconPosition[] = [],
): DesktopLayout {
  const layout: DesktopLayout = {};
  let slot = 0;
  for (const id of ids) {
    // Steps over the Trash rather than stacking an icon on top of it.
    while (blocked.some((taken) => overlaps(taken, slotPosition(slot, viewport)))) slot += 1;
    layout[id] = slotPosition(slot, viewport);
    slot += 1;
  }
  return layout;
}

/** Drops entries for things that no longer exist, so the record cannot grow forever. */
export function pruneLayout(layout: DesktopLayout, ids: string[]): DesktopLayout {
  const live = new Set(ids);
  const pruned: DesktopLayout = {};
  for (const [id, position] of Object.entries(layout)) {
    if (live.has(id)) pruned[id] = position;
  }
  return pruned;
}

/**
 * Which icon a drop landed on, if any. Used to file something into a folder
 * by dragging it on top — the dragged item itself is never a candidate.
 */
export function iconAt(
  layout: DesktopLayout,
  point: { x: number; y: number },
  ignoreId: string,
): string | null {
  for (const [id, position] of Object.entries(layout)) {
    if (id === ignoreId) continue;
    if (
      point.x >= position.x &&
      point.x <= position.x + CELL_WIDTH &&
      point.y >= position.y &&
      point.y <= position.y + CELL_HEIGHT
    ) {
      return id;
    }
  }
  return null;
}
