import { describe, expect, it } from 'vitest';
import {
  anySnapped,
  cascadeAll,
  CORNER,
  EDGE,
  GAP,
  resnap,
  snapByArrow,
  snapWindow,
  tileAll,
  tileRects,
  unsnapWindow,
  untileAll,
  visibleFrames,
  zoneAt,
  zoneRect,
} from '../tiling';
import {
  MIN_HEIGHT,
  MIN_WIDTH,
  isZoomed,
  mergeInto,
  minimizeWindow,
  openWindow,
  resizeWindow,
  restorable,
  toggleZoom,
  type Rect,
  type WindowKind,
  type WindowState,
} from '../windows';

const VIEW = { width: 1440, height: 800 };

function openMany(kinds: WindowKind[], view = VIEW): { windows: WindowState[]; ids: string[] } {
  let windows: WindowState[] = [];
  const ids: string[] = [];
  for (const kind of kinds) {
    const next = openWindow(windows, { kind, title: kind.type }, view);
    windows = next.windows;
    ids.push(next.id);
  }
  return { windows, ids };
}

const tools = (...names: string[]): WindowKind[] => names.map((tool) => ({ type: 'tool', tool }));

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('zones', () => {
  it('splits the desktop into two halves with a gap between, edge to edge', () => {
    const left = zoneRect('left', VIEW);
    const right = zoneRect('right', VIEW);
    expect(left.x).toBe(12);
    expect(right.x).toBe(left.x + left.width + GAP);
    expect(right.x + right.width).toBe(VIEW.width - 12);
    expect(left.height).toBe(VIEW.height - 16);
  });

  it('makes quarters from the halves', () => {
    const tl = zoneRect('top-left', VIEW);
    const bl = zoneRect('bottom-left', VIEW);
    const tr = zoneRect('top-right', VIEW);
    expect(tl.x).toBe(zoneRect('left', VIEW).x);
    expect(bl.y).toBe(tl.y + tl.height + GAP);
    expect(bl.y + bl.height).toBe(VIEW.height - 8);
    expect(tr.x).toBe(zoneRect('right', VIEW).x);
    expect(overlaps(tl, tr)).toBe(false);
  });

  it('fills the screen exactly as the zoom button always has', () => {
    const { windows, ids } = openMany(tools('shows'));
    const zoomed = toggleZoom(windows, ids[0]!, VIEW)[0]!.rect;
    expect(zoneRect('fill', VIEW)).toEqual(zoomed);
  });
});

describe('dragging to an edge', () => {
  it('snaps to a half at the side edges', () => {
    expect(zoneAt({ x: 2, y: 400 }, VIEW)).toBe('left');
    expect(zoneAt({ x: VIEW.width - 3, y: 400 }, VIEW)).toBe('right');
  });

  it('fills the screen at the top edge, even pushed up past it', () => {
    expect(zoneAt({ x: 700, y: 4 }, VIEW)).toBe('fill');
    expect(zoneAt({ x: 700, y: -30 }, VIEW)).toBe('fill');
  });

  it('takes a quarter near a corner', () => {
    expect(zoneAt({ x: 3, y: 20 }, VIEW)).toBe('top-left');
    expect(zoneAt({ x: 40, y: 2 }, VIEW)).toBe('top-left');
    expect(zoneAt({ x: VIEW.width - 1, y: VIEW.height - 10 }, VIEW)).toBe('bottom-right');
    expect(zoneAt({ x: 0, y: VIEW.height - CORNER + 1 }, VIEW)).toBe('bottom-left');
  });

  it('does nothing away from the edges, or at the bottom where the dock is', () => {
    expect(zoneAt({ x: 700, y: 400 }, VIEW)).toBeNull();
    expect(zoneAt({ x: EDGE + 1, y: 400 }, VIEW)).toBeNull();
    expect(zoneAt({ x: 700, y: VIEW.height + 20 }, VIEW)).toBeNull();
  });
});

describe('snapping with the arrow keys', () => {
  it('walks the way the big desktops do', () => {
    expect(snapByArrow(null, 'left')).toBe('left');
    expect(snapByArrow('left', 'up')).toBe('top-left');
    expect(snapByArrow('top-left', 'right')).toBe('top-right');
    expect(snapByArrow('top-right', 'down')).toBe('right');
    expect(snapByArrow('right', 'left')).toBe('restore');
    expect(snapByArrow(null, 'up')).toBe('fill');
    expect(snapByArrow('fill', 'down')).toBe('restore');
    expect(snapByArrow('tiled', 'down')).toBe('restore');
  });

  it('does nothing where there is nowhere to go', () => {
    expect(snapByArrow(null, 'down')).toBeNull();
    expect(snapByArrow('left', 'left')).toBeNull();
    expect(snapByArrow('fill', 'up')).toBeNull();
  });
});

describe('snapWindow and unsnapWindow', () => {
  it('keeps the size given by hand, and gives it back', () => {
    const { windows, ids } = openMany(tools('shows'));
    const before = windows[0]!.rect;
    const snapped = snapWindow(windows, ids[0]!, 'left', VIEW);
    expect(snapped[0]!.rect).toEqual(zoneRect('left', VIEW));
    expect(snapped[0]!.snap).toBe('left');
    expect(isZoomed(snapped[0]!)).toBe(true);
    const back = unsnapWindow(snapped, ids[0]!);
    expect(back[0]!.rect).toEqual(before);
    expect(back[0]!.snap).toBeNull();
    expect(back[0]!.restoreRect).toBeNull();
  });

  it('does not forget the original when snapped twice', () => {
    const { windows, ids } = openMany(tools('shows'));
    const before = windows[0]!.rect;
    const twice = snapWindow(snapWindow(windows, ids[0]!, 'left', VIEW), ids[0]!, 'top-right', VIEW);
    expect(twice[0]!.snap).toBe('top-right');
    expect(unsnapWindow(twice, ids[0]!)[0]!.rect).toEqual(before);
  });

  it('snaps a group of tabs as one frame', () => {
    const { windows, ids } = openMany(tools('shows', 'finance', 'artwork'));
    const grouped = mergeInto(windows, ids[0]!, ids[1]!);
    const snapped = snapWindow(grouped, ids[1]!, 'right', VIEW);
    const [a, b, c] = snapped;
    expect(a!.rect).toEqual(zoneRect('right', VIEW));
    expect(b!.rect).toEqual(zoneRect('right', VIEW));
    expect(c!.snap).toBeNull();
  });

  it('is no longer snapped once resized by hand', () => {
    const { windows, ids } = openMany(tools('shows'));
    const snapped = snapWindow(windows, ids[0]!, 'left', VIEW);
    const resized = resizeWindow(snapped, ids[0]!, 800, 600)[0]!;
    expect(resized.snap).toBeNull();
    expect(resized.restoreRect).toBeNull();
  });

  it('marks a zoomed window as filling, and restoring clears it', () => {
    const { windows, ids } = openMany(tools('shows'));
    const zoomed = toggleZoom(windows, ids[0]!, VIEW);
    expect(zoomed[0]!.snap).toBe('fill');
    expect(toggleZoom(zoomed, ids[0]!, VIEW)[0]!.snap).toBeNull();
  });
});

describe('tileRects', () => {
  it('puts two windows side by side in columns', () => {
    const [a, b] = tileRects('columns', 2, VIEW);
    expect(a!.x).toBe(12);
    expect(b!.x + b!.width).toBe(VIEW.width - 12);
    expect(a!.height).toBe(VIEW.height - 16);
    expect(overlaps(a!, b!)).toBe(false);
  });

  it('falls back to a grid rather than make windows narrower than they can be used', () => {
    const rects = tileRects('columns', 4, { width: 1024, height: 700 });
    for (const r of rects) expect(r.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(new Set(rects.map((r) => r.y)).size).toBe(2);
  });

  it('stretches the last row of a grid so it has no holes', () => {
    const rects = tileRects('grid', 3, VIEW);
    expect(rects).toHaveLength(3);
    expect(rects[2]!.width).toBe(VIEW.width - 24);
    expect(overlaps(rects[0]!, rects[1]!)).toBe(false);
    expect(overlaps(rects[1]!, rects[2]!)).toBe(false);
  });

  it('gives the main window most of the width and stacks the rest beside it', () => {
    const [main, ...rest] = tileRects('main', 3, VIEW);
    expect(main!.width).toBeGreaterThan(rest[0]!.width);
    expect(rest[0]!.x).toBe(main!.x + main!.width + GAP);
    expect(rest[1]!.y).toBe(rest[0]!.y + rest[0]!.height + GAP);
  });

  it('stacks rows only while each row is still tall enough', () => {
    const rows = tileRects('rows', 2, VIEW);
    expect(rows[1]!.y).toBe(rows[0]!.y + rows[0]!.height + GAP);
    for (const r of tileRects('rows', 5, VIEW)) expect(r.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
  });

  it('shares cells, visibly offset, once more windows are open than can fit', () => {
    const rects = tileRects('grid', 9, { width: 1024, height: 700 });
    expect(rects).toHaveLength(9);
    const sameCell = rects.filter((r) => r.x >= 12 && r.x < 12 + 60 && r.y < 8 + 60);
    expect(sameCell.length).toBeGreaterThan(1);
    const xs = new Set(sameCell.map((r) => `${r.x},${r.y}`));
    expect(xs.size).toBe(sameCell.length);
  });

  it('handles nothing and one', () => {
    expect(tileRects('grid', 0, VIEW)).toEqual([]);
    expect(tileRects('columns', 1, VIEW)).toEqual([zoneRect('fill', VIEW)]);
  });
});

describe('tileAll', () => {
  it('arranges every frame on screen without overlap', () => {
    const { windows } = openMany(tools('shows', 'finance', 'artwork'));
    const tiled = tileAll(windows, 'grid', VIEW);
    const rects = tiled.map((w) => w.rect);
    expect(overlaps(rects[0]!, rects[1]!)).toBe(false);
    expect(overlaps(rects[0]!, rects[2]!)).toBe(false);
    expect(overlaps(rects[1]!, rects[2]!)).toBe(false);
    expect(tiled.every((w) => w.snap === 'tiled')).toBe(true);
  });

  it('keeps a window on the left on the left', () => {
    const { windows, ids } = openMany(tools('shows', 'finance'));
    const placed = windows.map((w) =>
      w.id === ids[0] ? { ...w, rect: { ...w.rect, x: 900 } } : { ...w, rect: { ...w.rect, x: 40 } },
    );
    const tiled = tileAll(placed, 'columns', VIEW);
    const shows = tiled.find((w) => w.id === ids[0])!;
    const finance = tiled.find((w) => w.id === ids[1])!;
    expect(finance.rect.x).toBeLessThan(shows.rect.x);
  });

  it('gives the main cell to the window in front', () => {
    const { windows, ids } = openMany(tools('shows', 'finance', 'artwork'));
    const tiled = tileAll(windows, 'main', VIEW, ids[0]!);
    const main = tiled.find((w) => w.id === ids[0])!;
    expect(main.rect.width).toBe(Math.max(...tiled.map((w) => w.rect.width)));
  });

  it('leaves minimised windows in the tray', () => {
    const { windows, ids } = openMany(tools('shows', 'finance', 'artwork'));
    const tiled = tileAll(minimizeWindow(windows, ids[2]!), 'columns', VIEW);
    expect(tiled[2]!.rect).toEqual(windows[2]!.rect);
    expect(tiled[2]!.snap).toBeNull();
  });

  it('treats a group of tabs as one frame', () => {
    const { windows, ids } = openMany(tools('shows', 'finance', 'artwork'));
    const grouped = mergeInto(windows, ids[0]!, ids[1]!);
    expect(visibleFrames(grouped)).toHaveLength(2);
    const tiled = tileAll(grouped, 'columns', VIEW);
    expect(tiled[0]!.rect).toEqual(tiled[1]!.rect);
    expect(tiled[0]!.rect).not.toEqual(tiled[2]!.rect);
  });

  it('does nothing with fewer than two frames', () => {
    const { windows } = openMany(tools('shows'));
    expect(tileAll(windows, 'grid', VIEW)).toBe(windows);
  });

  it('puts everything back where it was by hand', () => {
    const { windows } = openMany(tools('shows', 'finance'));
    const back = untileAll(tileAll(windows, 'columns', VIEW));
    expect(back.map((w) => w.rect)).toEqual(windows.map((w) => w.rect));
    expect(anySnapped(back)).toBe(false);
  });
});

describe('resnap', () => {
  it('keeps a half a half when the desktop changes size', () => {
    const { windows, ids } = openMany(tools('shows'));
    const snapped = snapWindow(windows, ids[0]!, 'right', VIEW);
    const smaller = { width: 1024, height: 700 };
    expect(resnap(snapped, smaller, 'grid')[0]!.rect).toEqual(zoneRect('right', smaller));
  });

  it('lays tiled windows out again in the same order', () => {
    const { windows, ids } = openMany(tools('shows', 'finance'));
    const tiled = tileAll(windows, 'columns', VIEW);
    const leftFirst = tiled.find((w) => w.id === ids[0])!.rect.x < tiled.find((w) => w.id === ids[1])!.rect.x;
    const smaller = { width: 1100, height: 700 };
    const again = resnap(tiled, smaller, 'columns');
    const stillLeftFirst =
      again.find((w) => w.id === ids[0])!.rect.x < again.find((w) => w.id === ids[1])!.rect.x;
    expect(stillLeftFirst).toBe(leftFirst);
    expect(Math.max(...again.map((w) => w.rect.x + w.rect.width))).toBe(smaller.width - 12);
  });
});

describe('cascadeAll', () => {
  it('steps frames down and right at their own size, nothing snapped', () => {
    const { windows } = openMany(tools('shows', 'finance'));
    const cascaded = cascadeAll(tileAll(windows, 'columns', VIEW), VIEW);
    expect(cascaded[1]!.rect.y).toBeGreaterThan(cascaded[0]!.rect.y);
    expect(cascaded.every((w) => w.snap === null && w.restoreRect === null)).toBe(true);
    expect(cascaded[0]!.rect.width).toBe(windows[0]!.rect.width);
  });
});

describe('storage', () => {
  it('keeps a snap zone through a reload, and drops one it cannot trust', () => {
    const { windows, ids } = openMany(tools('shows', 'finance'));
    const snapped = snapWindow(windows, ids[0]!, 'left', VIEW);
    const stored = JSON.parse(JSON.stringify(snapped)) as Record<string, unknown>[];
    stored[1] = { ...stored[1], snap: 'sideways' };
    const back = restorable(stored, () => true);
    expect(back[0]!.snap).toBe('left');
    expect(back[1]!.snap).toBeNull();
  });

  it('reads windows saved before tiling existed', () => {
    const { windows } = openMany(tools('shows'));
    const old = JSON.parse(JSON.stringify(windows)) as Record<string, unknown>[];
    delete old[0]!.snap;
    expect(restorable(old, () => true)[0]!.snap).toBeNull();
  });
});
