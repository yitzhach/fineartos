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

/** One grid cell. Matches the icon size in the stylesheet. */
export const CELL_WIDTH = 116;
export const CELL_HEIGHT = 116;

/** Clear of the system bar at the top and the dock at the bottom. */
export const MARGIN_TOP = 16;
export const MARGIN_LEFT = 16;
export const MARGIN_BOTTOM = 110;

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

function occupies(layout: DesktopLayout, position: IconPosition, ignoreId?: string): boolean {
  return Object.entries(layout).some(
    ([id, placed]) => id !== ignoreId && placed.x === position.x && placed.y === position.y,
  );
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
 * Gives every id a position, leaving placed icons alone and slotting the rest
 * into the gaps. This runs on every render, so it must not reshuffle icons
 * that already have a home.
 */
export function resolveLayout(
  ids: string[],
  layout: DesktopLayout,
  viewport: Viewport,
): DesktopLayout {
  const resolved: DesktopLayout = {};
  const placed: DesktopLayout = {};

  for (const id of ids) {
    const existing = layout[id];
    if (existing) {
      const position = clampToDesktop(existing, viewport);
      resolved[id] = position;
      placed[id] = position;
    }
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
export function autoArrange(ids: string[], viewport: Viewport): DesktopLayout {
  const layout: DesktopLayout = {};
  ids.forEach((id, index) => {
    layout[id] = slotPosition(index, viewport);
  });
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
