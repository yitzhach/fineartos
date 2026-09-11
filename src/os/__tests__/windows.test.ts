import { describe, expect, it } from 'vitest';
import {
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
  minimizedWindows,
  moveWindow,
  openWindow,
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
