import { describe, expect, it } from 'vitest';
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  MARGIN_LEFT,
  MARGIN_TOP,
  autoArrange,
  clampToDesktop,
  defaultTrashSlot,
  firstFreeSlot,
  iconAt,
  overlaps,
  pruneLayout,
  resolveLayout,
  rowsPerColumn,
  slotPosition,
  snapToGrid,
  trashPositionOf,
  type DesktopLayout,
} from '../desktopLayout';

const VIEW = { width: 1512, height: 945 };

describe('snapToGrid', () => {
  it('pulls a hand-dragged icon onto the nearest cell', () => {
    const snapped = snapToGrid(MARGIN_LEFT + CELL_WIDTH + 9, MARGIN_TOP + 4);
    expect(snapped).toEqual({ x: MARGIN_LEFT + CELL_WIDTH, y: MARGIN_TOP });
  });

  it('never snaps to a negative position', () => {
    const snapped = snapToGrid(-500, -500);
    expect(snapped.x).toBeGreaterThanOrEqual(0);
    expect(snapped.y).toBeGreaterThanOrEqual(0);
  });
});

describe('clampToDesktop', () => {
  it('keeps an icon clear of the dock at the bottom', () => {
    const clamped = clampToDesktop({ x: 100, y: 99999 }, VIEW);
    expect(clamped.y).toBeLessThan(VIEW.height - CELL_HEIGHT);
  });

  it('keeps an icon on screen at the right', () => {
    const clamped = clampToDesktop({ x: 99999, y: 100 }, VIEW);
    expect(clamped.x + CELL_WIDTH).toBeLessThanOrEqual(VIEW.width);
  });

  it('leaves a position that already fits alone', () => {
    expect(clampToDesktop({ x: 200, y: 200 }, VIEW)).toEqual({ x: 200, y: 200 });
  });

  it('copes with a viewport smaller than one cell', () => {
    const clamped = clampToDesktop({ x: 500, y: 500 }, { width: 80, height: 80 });
    expect(clamped.x).toBe(MARGIN_LEFT);
    expect(clamped.y).toBe(MARGIN_TOP);
  });
});

describe('slots', () => {
  it('fills down a column before starting the next', () => {
    const rows = rowsPerColumn(VIEW);
    expect(slotPosition(0, VIEW).x).toBe(slotPosition(rows - 1, VIEW).x);
    expect(slotPosition(rows, VIEW).x).toBe(MARGIN_LEFT + CELL_WIDTH);
  });

  it('always fits at least one row, even on a tiny screen', () => {
    expect(rowsPerColumn({ width: 300, height: 100 })).toBe(1);
  });

  it('finds the first empty slot rather than stacking icons', () => {
    const layout: DesktopLayout = { a: slotPosition(0, VIEW) };
    expect(firstFreeSlot(layout, VIEW)).toEqual(slotPosition(1, VIEW));
  });

  it('returns the first slot when the desktop is empty', () => {
    expect(firstFreeSlot({}, VIEW)).toEqual(slotPosition(0, VIEW));
  });
});

describe('resolveLayout', () => {
  it('leaves an icon exactly where the artist put it', () => {
    const layout: DesktopLayout = { a: { x: 400, y: 300 } };
    expect(resolveLayout(['a'], layout, VIEW).a).toEqual({ x: 400, y: 300 });
  });

  it('gives a brand new item a slot of its own', () => {
    const layout: DesktopLayout = { a: slotPosition(0, VIEW) };
    const resolved = resolveLayout(['a', 'b'], layout, VIEW);
    expect(resolved.b).not.toEqual(resolved.a);
  });

  it('never puts two new items on top of each other', () => {
    const resolved = resolveLayout(['a', 'b', 'c'], {}, VIEW);
    const seen = new Set(Object.values(resolved).map((p) => `${p.x},${p.y}`));
    expect(seen.size).toBe(3);
  });

  it('pulls a placed icon back on screen when the window shrinks', () => {
    const layout: DesktopLayout = { a: { x: 1400, y: 800 } };
    const resolved = resolveLayout(['a'], layout, { width: 600, height: 500 });
    expect(resolved.a!.x + CELL_WIDTH).toBeLessThanOrEqual(600);
  });

  it('ignores positions for items that are gone', () => {
    const layout: DesktopLayout = { a: { x: 400, y: 300 }, ghost: { x: 0, y: 0 } };
    expect(Object.keys(resolveLayout(['a'], layout, VIEW))).toEqual(['a']);
  });
});

describe('autoArrange', () => {
  it('tidies everything into order, overriding hand placement', () => {
    const arranged = autoArrange(['a', 'b'], VIEW);
    expect(arranged.a).toEqual(slotPosition(0, VIEW));
    expect(arranged.b).toEqual(slotPosition(1, VIEW));
  });

  it('is empty for an empty desktop', () => {
    expect(autoArrange([], VIEW)).toEqual({});
  });
});

describe('pruneLayout', () => {
  it('forgets items that no longer exist', () => {
    const pruned = pruneLayout({ a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }, ['a']);
    expect(pruned).toEqual({ a: { x: 1, y: 1 } });
  });
});

describe('iconAt', () => {
  const layout: DesktopLayout = { folder: { x: 200, y: 200 }, file: { x: 400, y: 200 } };

  it('finds the icon under a drop', () => {
    expect(iconAt(layout, { x: 210, y: 210 }, 'file')).toBe('folder');
  });

  it('never reports the icon being dragged', () => {
    expect(iconAt(layout, { x: 410, y: 210 }, 'file')).toBeNull();
  });

  it('reports nothing for a drop on empty desktop', () => {
    expect(iconAt(layout, { x: 900, y: 700 }, 'file')).toBeNull();
  });

  it('counts the whole cell, not just its centre', () => {
    expect(iconAt(layout, { x: 200 + CELL_WIDTH - 1, y: 200 }, 'file')).toBe('folder');
  });
});

describe('the Trash position', () => {
  it('starts bottom left, clear of the dock', () => {
    const slot = defaultTrashSlot(VIEW);
    expect(slot.x).toBe(MARGIN_LEFT);
    expect(slot.y).toBeLessThan(VIEW.height - CELL_HEIGHT);
  });

  it('stays on screen on a phone', () => {
    const slot = defaultTrashSlot({ width: 390, height: 700 });
    expect(slot.x).toBeGreaterThanOrEqual(MARGIN_LEFT);
    expect(slot.y).toBeGreaterThanOrEqual(MARGIN_TOP);
  });

  it('goes where the artist left it', () => {
    expect(trashPositionOf({ x: 400, y: 300 }, VIEW)).toEqual({ x: 400, y: 300 });
  });

  it('falls back to the default when it has never been moved', () => {
    expect(trashPositionOf(null, VIEW)).toEqual(defaultTrashSlot(VIEW));
  });

  it('pulls a can left off the edge of a big screen back into a small one', () => {
    const small = { width: 600, height: 500 };
    const moved = trashPositionOf({ x: 1400, y: 800 }, small);
    expect(moved.x + CELL_WIDTH).toBeLessThanOrEqual(small.width);
  });

  it('is somewhere auto-arrange will not put an icon', () => {
    const slot = defaultTrashSlot(VIEW);
    const arranged = autoArrange(['a', 'b', 'c'], VIEW, [slot]);
    for (const position of Object.values(arranged)) {
      expect(position).not.toEqual(slot);
    }
  });

  it('steps over the blocked slot instead of dropping an icon', () => {
    const blocked = slotPosition(1, VIEW);
    const arranged = autoArrange(['a', 'b'], VIEW, [blocked]);
    expect(arranged.a).toEqual(slotPosition(0, VIEW));
    expect(arranged.b).toEqual(slotPosition(2, VIEW));
  });
});

// --- Nothing lands on the Trash ---------------------------------------------

describe('the Trash and the icons', () => {
  const view = { width: 1440, height: 760 };

  it('starts on the grid, not a few pixels off it', () => {
    const trash = defaultTrashSlot(view);
    const rows = rowsPerColumn(view);
    // The bottom slot of the first column — a real slot, which is what makes
    // it visible to every collision check.
    expect(trash).toEqual(slotPosition(rows - 1, view));
  });

  it('knows when two icons would cover each other', () => {
    expect(overlaps({ x: 16, y: 16 }, { x: 16, y: 16 })).toBe(true);
    // Three pixels out is still on top of it.
    expect(overlaps({ x: 16, y: 16 }, { x: 19, y: 13 })).toBe(true);
    expect(overlaps({ x: 16, y: 16 }, { x: 16 + CELL_WIDTH, y: 16 })).toBe(false);
  });

  it('steps a new icon over the Trash instead of onto it', () => {
    const trash = defaultTrashSlot(view);
    const rows = rowsPerColumn(view);
    // Exactly enough icons to fill the first column, including the Trash's slot.
    const ids = Array.from({ length: rows }, (_, index) => `piece-${index}`);
    const layout = resolveLayout(ids, {}, view, [trash]);
    for (const id of ids) {
      expect(overlaps(layout[id]!, trash)).toBe(false);
    }
    // And they are all still in different places from each other.
    const seen = new Set(Object.values(layout).map((spot) => `${spot.x},${spot.y}`));
    expect(seen.size).toBe(ids.length);
  });

  it('leaves an icon the artist dragged onto the Trash where they put it', () => {
    const trash = defaultTrashSlot(view);
    // Hand-placed wins: this was a choice, and moving it would be the app
    // rearranging the desk on its own.
    const layout = resolveLayout(['one'], { one: trash }, view, [trash]);
    expect(layout.one).toEqual(trash);
  });

  it('tidies around it too', () => {
    const trash = defaultTrashSlot(view);
    const ids = Array.from({ length: 8 }, (_, index) => `piece-${index}`);
    const tidied = autoArrange(ids, view, [trash]);
    for (const id of ids) expect(overlaps(tidied[id]!, trash)).toBe(false);
  });
});

describe('a window that shrinks', () => {
  const big = { width: 1440, height: 900 };
  const small = { width: 1100, height: 420 };

  it('does not pile a column onto the last row', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    // Arranged down one column on a tall screen…
    const arranged = autoArrange(ids, big);
    // …then the window is made short, so most of them no longer fit.
    const resolved = resolveLayout(ids, arranged, small);
    for (const id of ids) {
      for (const other of ids) {
        if (id === other) continue;
        expect(overlaps(resolved[id]!, resolved[other]!)).toBe(false);
      }
    }
  });

  it('puts them back when the window grows again, because it never rewrote them', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const arranged = autoArrange(ids, big);
    resolveLayout(ids, arranged, small);
    // The stored layout is the artist's; only the view of it was nudged.
    expect(resolveLayout(ids, arranged, big)).toEqual(arranged);
  });
});

describe('the Trash on a small screen', () => {
  const short = { width: 1100, height: 420 };

  it('moves out from under an icon that was already there', () => {
    const rows = rowsPerColumn(short);
    // The whole first column is taken by work the artist placed.
    const taken = Array.from({ length: rows }, (_, row) => slotPosition(row, short));
    const trash = defaultTrashSlot(short, taken);
    for (const spot of taken) expect(overlaps(trash, spot)).toBe(false);
  });

  it('carries on into the next column when the first has no room at all', () => {
    const rows = rowsPerColumn(short);
    // Two full columns, so it has to look further right.
    const taken = Array.from({ length: rows * 2 }, (_, index) => slotPosition(index, short));
    const trash = defaultTrashSlot(short, taken);
    for (const spot of taken) expect(overlaps(trash, spot)).toBe(false);
  });

  it('still keeps a position the artist chose, even under something', () => {
    const chosen = { x: 16, y: 16 };
    expect(trashPositionOf(chosen, short, [chosen])).toEqual(chosen);
  });
});
