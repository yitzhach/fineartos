import { describe, expect, it } from 'vitest';
import {
  activeTab,
  cascadeRect,
  defaultSize,
  clampToViewport,
  closeWindow,
  focusWindow,
  focused,
  isZoomed,
  keyFor,
  MIN_HEIGHT,
  MIN_WIDTH,
  minimizeWindow,
  mergeAll,
  minimizedWindows,
  dropTargetAt,
  mergeInto,
  moveWindow,
  openWindow,
  pullOutTab,
  restorable,
  renderGroups,
  stepTab,
  tabsOf,
  resizeWindow,
  toggleWindow,
  toggleZoom,
  topZ,
  type WindowState,
} from '../windows';

const VIEW = { width: 1512, height: 945 };

function open(windows: WindowState[], kind: Parameters<typeof openWindow>[1]['kind'], title = 'W') {
  return openWindow(windows, { kind, title }, VIEW);
}

describe('keyFor', () => {
  it('identifies a window by its subject, not by its type alone', () => {
    expect(keyFor({ type: 'commission', docId: 'a' })).not.toBe(
      keyFor({ type: 'commission', docId: 'b' }),
    );
  });

  it('gives singleton windows a stable key', () => {
    expect(keyFor({ type: 'settings' })).toBe('settings');
  });
});

describe('opening', () => {
  it('adds a window and focuses it', () => {
    const { windows, id } = open([], { type: 'settings' });
    expect(windows).toHaveLength(1);
    expect(focused(windows)?.id).toBe(id);
  });

  it('focuses the existing window instead of opening a second onto the same thing', () => {
    const first = open([], { type: 'invoice', invoiceId: 'inv-1' });
    const second = openWindow(first.windows, {
      kind: { type: 'invoice', invoiceId: 'inv-1' },
      title: 'Invoice',
    }, VIEW);
    expect(second.windows).toHaveLength(1);
    expect(second.id).toBe(first.id);
  });

  it('does open a separate window for a different subject of the same type', () => {
    const a = open([], { type: 'commission', docId: 'one' });
    const b = openWindow(a.windows, { kind: { type: 'commission', docId: 'two' }, title: 'Two' }, VIEW);
    expect(b.windows).toHaveLength(2);
  });

  it('un-minimises and raises a window that was in the tray', () => {
    const a = open([], { type: 'settings' });
    const hidden = minimizeWindow(a.windows, a.id);
    const again = openWindow(hidden, { kind: { type: 'settings' }, title: 'Settings' }, VIEW);
    expect(again.windows[0]?.minimized).toBe(false);
  });

  it('refreshes the title, since the subject may have been renamed', () => {
    const a = openWindow([], { kind: { type: 'folder', projectId: 'p' }, title: 'Old' }, VIEW);
    const b = openWindow(a.windows, { kind: { type: 'folder', projectId: 'p' }, title: 'New' }, VIEW);
    expect(b.windows[0]?.title).toBe('New');
  });

  it('cascades each new window so a stack looks like a stack', () => {
    const first = cascadeRect(0, VIEW);
    const second = cascadeRect(1, VIEW);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });

  it('wraps the cascade rather than walking off the screen', () => {
    expect(cascadeRect(6, VIEW)).toEqual(cascadeRect(0, VIEW));
  });

  it('never opens a window hanging off the right edge', () => {
    const narrow = { width: 900, height: 700 };
    const rect = cascadeRect(5, narrow, defaultSize({ type: 'commission', docId: 'a' }, narrow));
    expect(rect.x + rect.width).toBeLessThanOrEqual(narrow.width);
  });

  it('opens inside the desktop, not past the bottom of it', () => {
    // The desktop clips: a window past its bottom edge loses its border and
    // its resize grip with no scrollbar to reach them with.
    const stage = { width: 1512, height: 700 };
    for (let count = 0; count < 8; count += 1) {
      const kind = { type: 'tool' as const, tool: 'connect' };
      const rect = cascadeRect(count, stage, defaultSize(kind, stage));
      expect(rect.y + rect.height).toBeLessThanOrEqual(stage.height);
    }
  });

  it('gives a project more room than a preview tool', () => {
    const project = defaultSize({ type: 'commission', docId: 'a' }, VIEW);
    const tool = defaultSize({ type: 'tool', tool: 'calendar' }, VIEW);
    expect(project.width).toBeGreaterThan(tool.width);
  });

  it('shrinks the default to fit a small screen', () => {
    const small = { width: 700, height: 600 };
    const size = defaultSize({ type: 'commission', docId: 'a' }, small);
    expect(size.width).toBeLessThanOrEqual(small.width);
  });
});

describe('stacking', () => {
  it('raises a window above the others when focused', () => {
    let { windows } = open([], { type: 'settings' });
    const second = openWindow(windows, { kind: { type: 'list' }, title: 'List' }, VIEW);
    windows = second.windows;
    const settingsId = windows[0]!.id;

    expect(focused(windows)?.id).toBe(second.id);
    windows = focusWindow(windows, settingsId);
    expect(focused(windows)?.id).toBe(settingsId);
  });

  it('leaves the list untouched when focusing what is already on top', () => {
    const { windows, id } = open([], { type: 'settings' });
    expect(focusWindow(windows, id)).toBe(windows);
  });

  it('ignores a focus request for a window that is gone', () => {
    const { windows } = open([], { type: 'settings' });
    expect(focusWindow(windows, 'no-such-window')).toBe(windows);
  });

  it('never lets z run backwards as windows open', () => {
    let windows: WindowState[] = [];
    for (const tool of ['a', 'b', 'c']) {
      windows = openWindow(windows, { kind: { type: 'tool', tool }, title: tool }, VIEW).windows;
    }
    expect(topZ(windows)).toBe(3);
  });
});

describe('minimising', () => {
  it('keeps the window, its size and its position', () => {
    const { windows, id } = open([], { type: 'settings' });
    const before = windows[0]!.rect;
    const after = minimizeWindow(windows, id);
    expect(after).toHaveLength(1);
    expect(after[0]?.rect).toEqual(before);
  });

  it('takes it out of the running for focus', () => {
    const a = open([], { type: 'settings' });
    const b = openWindow(a.windows, { kind: { type: 'list' }, title: 'L' }, VIEW);
    const hidden = minimizeWindow(b.windows, b.id);
    expect(focused(hidden)?.id).toBe(a.id);
  });

  it('reports nothing focused when every window is in the tray', () => {
    const { windows, id } = open([], { type: 'settings' });
    expect(focused(minimizeWindow(windows, id))).toBeNull();
  });

  it('lists what is in the tray', () => {
    const { windows, id } = open([], { type: 'settings' });
    expect(minimizedWindows(minimizeWindow(windows, id))).toHaveLength(1);
  });
});

describe('moving and resizing', () => {
  it('moves to the requested position', () => {
    const { windows, id } = open([], { type: 'settings' });
    expect(moveWindow(windows, id, 300, 200)[0]?.rect).toMatchObject({ x: 300, y: 200 });
  });

  it('never lets a window go above the system bar', () => {
    const { windows, id } = open([], { type: 'settings' });
    expect(moveWindow(windows, id, 100, -400)[0]?.rect.y).toBe(0);
  });

  it('keeps enough of the titlebar on screen to grab it again', () => {
    const { windows, id } = open([], { type: 'settings' });
    const moved = moveWindow(windows, id, -99999, 100)[0]!;
    expect(moved.rect.x + moved.rect.width).toBeGreaterThanOrEqual(120);
  });

  it('refuses to resize below a usable size', () => {
    const { windows, id } = open([], { type: 'settings' });
    const small = resizeWindow(windows, id, 10, 10)[0]!;
    expect(small.rect.width).toBe(MIN_WIDTH);
    expect(small.rect.height).toBe(MIN_HEIGHT);
  });
});

describe('zooming', () => {
  it('fills the screen and remembers the size it had', () => {
    const { windows, id } = open([], { type: 'settings' });
    const before = windows[0]!.rect;
    const zoomed = toggleZoom(windows, id, VIEW);
    expect(isZoomed(zoomed[0]!)).toBe(true);
    expect(zoomed[0]!.rect.width).toBe(VIEW.width - 24);
    expect(zoomed[0]!.restoreRect).toEqual(before);
  });

  it('puts it back exactly where it was', () => {
    const { windows, id } = open([], { type: 'settings' });
    const before = windows[0]!.rect;
    const restored = toggleZoom(toggleZoom(windows, id, VIEW), id, VIEW);
    expect(restored[0]!.rect).toEqual(before);
    expect(isZoomed(restored[0]!)).toBe(false);
  });

  it('stops being zoomed once resized by hand', () => {
    const { windows, id } = open([], { type: 'settings' });
    const zoomed = toggleZoom(windows, id, VIEW);
    expect(isZoomed(resizeWindow(zoomed, id, 800, 600)[0]!)).toBe(false);
  });
});

describe('closing', () => {
  it('removes only that window', () => {
    const a = open([], { type: 'settings' });
    const b = openWindow(a.windows, { kind: { type: 'list' }, title: 'L' }, VIEW);
    const closed = closeWindow(b.windows, a.id);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.id).toBe(b.id);
  });

  it('is harmless when the window is already gone', () => {
    const { windows } = open([], { type: 'settings' });
    expect(closeWindow(windows, 'nope')).toHaveLength(1);
  });
});

describe('clampToViewport', () => {
  it('pulls a window back when the screen gets smaller', () => {
    const { windows } = open([], { type: 'settings' });
    const moved = moveWindow(windows, windows[0]!.id, 1400, 800);
    const clamped = clampToViewport(moved, { width: 700, height: 500 });
    expect(clamped[0]!.rect.x).toBeLessThanOrEqual(700);
    expect(clamped[0]!.rect.y).toBeLessThanOrEqual(500);
  });

  it('leaves windows alone when they already fit', () => {
    const { windows } = open([], { type: 'settings' });
    expect(clampToViewport(windows, VIEW)[0]).toBe(windows[0]);
  });
});

describe('toggleWindow', () => {
  const spec = { kind: { type: 'tool' as const, tool: 'calendar' }, title: 'Calendar' };

  it('opens the tool when it is not open', () => {
    const result = toggleWindow([], spec, VIEW);
    expect(result.windows).toHaveLength(1);
    expect(result.id).not.toBeNull();
  });

  it('closes the tool when it is already in front', () => {
    const opened = toggleWindow([], spec, VIEW).windows;
    const result = toggleWindow(opened, spec, VIEW);
    expect(result.windows).toHaveLength(0);
    expect(result.id).toBeNull();
  });

  it('raises a buried tool rather than closing it', () => {
    let windows = toggleWindow([], spec, VIEW).windows;
    windows = openWindow(windows, { kind: { type: 'list' }, title: 'Projects' }, VIEW).windows;
    const result = toggleWindow(windows, spec, VIEW);
    expect(result.windows).toHaveLength(2);
    expect(focused(result.windows)?.kind).toEqual(spec.kind);
  });

  it('brings a minimised tool back rather than closing it', () => {
    const opened = toggleWindow([], spec, VIEW).windows;
    const first = opened[0]!;
    const away = minimizeWindow(opened, first.id);
    const result = toggleWindow(away, spec, VIEW);
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]!.minimized).toBe(false);
  });
});


// --- Tabs -------------------------------------------------------------------

describe('tabs', () => {
  /** Three windows open, the last one focused, as the artist would have them. */
  const three = () => {
    let windows = open([], { type: 'settings' }, 'Settings').windows;
    windows = open(windows, { type: 'tool', tool: 'connect' }, 'Connect').windows;
    windows = open(windows, { type: 'tool', tool: 'finder' }, 'Finder').windows;
    return windows;
  };

  it('leaves a window on its own alone until it is merged', () => {
    const windows = three();
    expect(windows.every((w) => w.groupId === null)).toBe(true);
    expect(renderGroups(windows)).toHaveLength(3);
    expect(tabsOf(windows, windows[0]!.id)).toHaveLength(1);
  });

  it('merges every open window into one frame', () => {
    const merged = mergeAll(three());
    expect(renderGroups(merged)).toHaveLength(1);
    expect(renderGroups(merged)[0]!.tabs).toHaveLength(3);
    expect(new Set(merged.map((w) => w.groupId)).size).toBe(1);
  });

  it('gives them all the focused window\'s rect, which is the one that was arranged', () => {
    let windows = three();
    const front = focused(windows)!;
    windows = moveWindow(windows, front.id, 210, 96);
    const merged = mergeAll(windows);
    expect(merged.every((w) => w.rect.x === 210 && w.rect.y === 96)).toBe(true);
  });

  it('needs two windows: merging one changes nothing', () => {
    const one = open([], { type: 'settings' }).windows;
    expect(mergeAll(one)).toEqual(one);
  });

  it('leaves a minimised window in the tray rather than dragging it back out', () => {
    let windows = three();
    const put = windows[0]!.id;
    windows = minimizeWindow(windows, put);
    const merged = mergeAll(windows);
    expect(merged.find((w) => w.id === put)!.groupId).toBeNull();
    expect(merged.find((w) => w.id === put)!.minimized).toBe(true);
    expect(renderGroups(merged.filter((w) => !w.minimized))[0]!.tabs).toHaveLength(2);
  });

  it('shows the highest window in the group as the tab on top', () => {
    const merged = mergeAll(three());
    const groupId = merged[0]!.groupId!;
    const wanted = merged[0]!.id;
    const raised = focusWindow(merged, wanted);
    expect(activeTab(raised, groupId)!.id).toBe(wanted);
    expect(renderGroups(raised)[0]!.active.id).toBe(wanted);
  });

  it('raises the whole frame when one of its tabs is focused', () => {
    let windows = mergeAll(three());
    windows = open(windows, { type: 'list' }, 'Everything').windows;
    const loose = focused(windows)!.id;
    const tab = windows.find((w) => w.groupId !== null)!.id;
    const raised = focusWindow(windows, tab);
    const group = raised.filter((w) => w.groupId !== null);
    // Every tab is above the window that was in front, not just the one clicked.
    expect(Math.min(...group.map((w) => w.z))).toBeGreaterThan(
      raised.find((w) => w.id === loose)!.z,
    );
  });

  it('moves, resizes, zooms and minimises as one frame', () => {
    const merged = mergeAll(three());
    const one = merged[0]!.id;

    const moved = moveWindow(merged, one, 120, 60);
    expect(moved.every((w) => w.rect.x === 120 && w.rect.y === 60)).toBe(true);

    const sized = resizeWindow(merged, one, 900, 600);
    expect(sized.every((w) => w.rect.width === 900 && w.rect.height === 600)).toBe(true);

    const zoomed = toggleZoom(merged, one, VIEW);
    expect(zoomed.every(isZoomed)).toBe(true);

    const away = minimizeWindow(merged, one);
    expect(away.every((w) => w.minimized)).toBe(true);
  });

  it('puts a minimised group in the tray once, not once per tab', () => {
    const merged = mergeAll(three());
    expect(minimizedWindows(minimizeWindow(merged, merged[0]!.id))).toHaveLength(1);
  });

  it('takes a tab back out into a window of its own, stepped off the frame', () => {
    const merged = mergeAll(three());
    const id = merged[1]!.id;
    const out = pullOutTab(merged, id, VIEW);
    const pulled = out.find((w) => w.id === id)!;
    expect(pulled.groupId).toBeNull();
    expect(pulled.rect.x).toBeGreaterThan(merged[1]!.rect.x);
    expect(focused(out)!.id).toBe(id);
    expect(renderGroups(out)).toHaveLength(2);
  });

  it('frees the tab left behind, because a group of one is not a group', () => {
    let windows = mergeAll(three());
    windows = pullOutTab(windows, windows[0]!.id, VIEW);
    windows = pullOutTab(windows, windows[1]!.id, VIEW);
    expect(windows.every((w) => w.groupId === null)).toBe(true);
    expect(renderGroups(windows)).toHaveLength(3);
  });

  it('closing a tab leaves the rest of the frame alone', () => {
    const merged = mergeAll(three());
    const left = closeWindow(merged, merged[0]!.id);
    expect(renderGroups(left)).toHaveLength(1);
    expect(renderGroups(left)[0]!.tabs).toHaveLength(2);
  });

  it('steps through the tabs and wraps at both ends', () => {
    const merged = mergeAll(three());
    const [first, second, third] = merged.map((w) => w.id) as [string, string, string];
    expect(stepTab(merged, first, 1)).toBe(second);
    expect(stepTab(merged, third, 1)).toBe(first);
    expect(stepTab(merged, first, -1)).toBe(third);
  });

  it('has nowhere to step in a window on its own', () => {
    const windows = three();
    expect(stepTab(windows, windows[0]!.id, 1)).toBe(windows[0]!.id);
  });

  it('opens a tool that is already a tab as that tab, rather than a second copy', () => {
    const merged = mergeAll(three());
    const again = openWindow(merged, { kind: { type: 'tool', tool: 'connect' }, title: 'Connect' }, VIEW);
    expect(again.windows).toHaveLength(3);
    expect(focused(again.windows)!.id).toBe(again.id);
    expect(activeTab(again.windows, merged[0]!.groupId!)!.id).toBe(again.id);
  });
});


// --- Dropping one window onto another ---------------------------------------

describe('drag to tab', () => {
  const two = () => {
    let windows = open([], { type: 'settings' }, 'Settings').windows;
    windows = open(windows, { type: 'tool', tool: 'connect' }, 'Connect').windows;
    return windows;
  };

  it('finds the frame under the pointer when it is over the titlebar', () => {
    const windows = two();
    const target = windows[0]!;
    const point = { x: target.rect.x + 40, y: target.rect.y + 20 };
    expect(dropTargetAt(windows, windows[1]!.id, point)?.id).toBe(target.id);
  });

  it('is not a drop when the pointer is over the body of a window', () => {
    const windows = two();
    const target = windows[0]!;
    const point = { x: target.rect.x + 40, y: target.rect.y + 300 };
    expect(dropTargetAt(windows, windows[1]!.id, point)).toBeNull();
  });

  it('never offers a window to itself, or a tab to its own frame', () => {
    const windows = mergeAll(two());
    const at = { x: windows[0]!.rect.x + 40, y: windows[0]!.rect.y + 20 };
    expect(dropTargetAt(windows, windows[0]!.id, at)).toBeNull();
    expect(dropTargetAt(windows, windows[1]!.id, at)).toBeNull();
  });

  it('takes the frame in front where two overlap', () => {
    let windows = two();
    // Put the second window exactly over the first, and raise it.
    windows = moveWindow(windows, windows[1]!.id, windows[0]!.rect.x, windows[0]!.rect.y);
    windows = focusWindow(windows, windows[1]!.id);
    windows = open(windows, { type: 'list' }, 'Everything').windows;
    const dragged = focused(windows)!.id;
    const point = { x: windows[0]!.rect.x + 40, y: windows[0]!.rect.y + 20 };
    expect(dropTargetAt(windows, dragged, point)?.id).toBe(windows[1]!.id);
  });

  it('makes the dropped window a tab, on top, in the target\'s place', () => {
    const windows = two();
    const merged = mergeInto(windows, windows[1]!.id, windows[0]!.id);
    expect(renderGroups(merged)).toHaveLength(1);
    expect(renderGroups(merged)[0]!.active.id).toBe(windows[1]!.id);
    expect(merged.every((w) => w.rect.x === windows[0]!.rect.x)).toBe(true);
  });

  it('brings the tabs of a dragged frame with it', () => {
    let windows = two();
    windows = mergeAll(windows);
    windows = open(windows, { type: 'list' }, 'Everything').windows;
    const loose = focused(windows)!.id;
    // Drop the pair onto the loose window: everything ends in one frame.
    const merged = mergeInto(windows, windows[0]!.id, loose);
    expect(renderGroups(merged)).toHaveLength(1);
    expect(renderGroups(merged)[0]!.tabs).toHaveLength(3);
  });

  it('does nothing when the two are already in the same frame', () => {
    const merged = mergeAll(two());
    expect(mergeInto(merged, merged[0]!.id, merged[1]!.id)).toEqual(merged);
  });
});

// --- Putting the arrangement back -------------------------------------------

describe('restorable', () => {
  const everythingExists = () => true;

  it('puts back what was open', () => {
    const windows = open(open([], { type: 'settings' }).windows, { type: 'list' }).windows;
    const back = restorable(JSON.parse(JSON.stringify(windows)), everythingExists);
    expect(back).toHaveLength(2);
    expect(back.map((w) => w.kind.type)).toEqual(['settings', 'list']);
  });

  it('drops a window whose record has been deleted', () => {
    const windows = open(
      open([], { type: 'commission', docId: 'gone' }).windows,
      { type: 'settings' },
    ).windows;
    const back = restorable(windows, (kind) => kind.type !== 'commission');
    expect(back.map((w) => w.kind.type)).toEqual(['settings']);
  });

  it('refuses anything that is not a window, because storage can be edited', () => {
    expect(restorable('nonsense', everythingExists)).toEqual([]);
    expect(restorable([{ id: 5 }, null, {}, { id: 'a', title: 'a' }], everythingExists)).toEqual([]);
    expect(
      restorable([{ id: 'a', title: 'A', kind: { type: 'nope' }, rect: { x: 0, y: 0, width: 1, height: 1 } }], everythingExists),
    ).toEqual([]);
  });

  it('keeps one window per subject', () => {
    const windows = open([], { type: 'settings' }).windows;
    const back = restorable([...windows, { ...windows[0]!, id: 'copy' }], everythingExists);
    expect(back).toHaveLength(1);
  });

  it('renumbers the stack rather than carrying a session\'s worth of z', () => {
    const windows = open(open([], { type: 'settings' }).windows, { type: 'list' }).windows.map(
      (w, index) => ({ ...w, z: 4000 + index }),
    );
    expect(restorable(windows, everythingExists).map((w) => w.z)).toEqual([1, 2]);
  });

  it('keeps a group together, and frees one whose other tabs are gone', () => {
    const merged = mergeAll(
      open(open([], { type: 'settings' }).windows, { type: 'list' }).windows,
    );
    expect(restorable(merged, everythingExists).every((w) => w.groupId !== null)).toBe(true);

    const half = merged.filter((w) => w.kind.type === 'settings');
    expect(restorable(half, everythingExists)[0]!.groupId).toBeNull();
  });
});
