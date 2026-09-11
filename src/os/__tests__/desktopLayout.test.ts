import { describe, expect, it } from 'vitest';
import {
  autoArrange,
  CELL_HEIGHT,
  CELL_WIDTH,
  clampToDesktop,
  firstFreeSlot,
  iconAt,
  MARGIN_LEFT,
  MARGIN_TOP,
  pruneLayout,
  resolveLayout,
  rowsPerColumn,
  slotPosition,
  snapToGrid,
  trashSlot,
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

describe('trashSlot', () => {
  it('sits in the bottom right, clear of the dock', () => {
    const slot = trashSlot(VIEW);
    expect(slot.x + CELL_WIDTH).toBeLessThanOrEqual(VIEW.width);
    expect(slot.y).toBeLessThan(VIEW.height - CELL_HEIGHT);
  });

  it('stays on screen on a phone', () => {
    const slot = trashSlot({ width: 390, height: 700 });
    expect(slot.x).toBeGreaterThanOrEqual(MARGIN_LEFT);
    expect(slot.y).toBeGreaterThanOrEqual(MARGIN_TOP);
  });

  it('is somewhere auto-arrange will not put an icon', () => {
    const slot = trashSlot(VIEW);
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
