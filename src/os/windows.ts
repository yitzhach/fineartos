/**
 * The window manager's state, as plain data.
 *
 * DOM-free on purpose, like the rest of this project's model layer: every
 * rule about stacking, focus, minimising and zooming is a pure function that
 * can be tested without a browser. The React layer only draws the result.
 *
 * The rules worth stating, because they are what makes windows feel like
 * windows rather than like panels:
 *  - One window is focused. Focusing raises it above the others.
 *  - Opening a window that is already open focuses it instead of making a
 *    second copy. Two windows onto the same invoice could disagree.
 *  - Minimising never loses a window: it goes to the tray and keeps its size
 *    and position for when it comes back.
 *  - Zooming remembers the size it had before, so restoring puts it back
 *    exactly where it was rather than at some default.
 */

export type WindowKind =
  | { type: 'commission'; docId: string }
  | { type: 'invoice'; invoiceId: string }
  | { type: 'folder'; projectId: string }
  | { type: 'photo'; photoId: string }
  | { type: 'photoEdit'; photoId: string }
  | { type: 'list' }
  | { type: 'settings' }
  | { type: 'tool'; tool: string };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  id: string;
  kind: WindowKind;
  title: string;
  subtitle: string | null;
  rect: Rect;
  /** Stacking order. Higher is nearer the front. */
  z: number;
  minimized: boolean;
  /** The rect to go back to when un-zooming. Null when not zoomed. */
  restoreRect: Rect | null;
}

export const MIN_WIDTH = 420;
export const MIN_HEIGHT = 280;

/** Identity for a window's subject, so the same thing opens once. */
export function keyFor(kind: WindowKind): string {
  if (kind.type === 'commission') return `commission:${kind.docId}`;
  if (kind.type === 'invoice') return `invoice:${kind.invoiceId}`;
  if (kind.type === 'folder') return `folder:${kind.projectId}`;
  if (kind.type === 'photo') return `photo:${kind.photoId}`;
  if (kind.type === 'photoEdit') return `photo-edit:${kind.photoId}`;
  if (kind.type === 'tool') return `tool:${kind.tool}`;
  return kind.type;
}

export function topZ(windows: WindowState[]): number {
  return windows.reduce((max, w) => Math.max(max, w.z), 0);
}

export function focused(windows: WindowState[]): WindowState | null {
  const visible = windows.filter((w) => !w.minimized);
  if (visible.length === 0) return null;
  return visible.reduce((top, w) => (w.z > top.z ? w : top));
}

/**
 * How big a window opens, by what is in it. A calendar does not need the room
 * a project does, and opening everything at full size buries whatever is
 * underneath — which is the opposite of what a window manager is for.
 */
export function defaultSize(
  kind: WindowKind,
  viewport: { width: number; height: number },
): { width: number; height: number } {
  // Connect is two columns of form: at the small size they crush together.
  // The editor is a picture beside a column of controls: at the medium size
  // the sliders and the picture fight for the same room.
  const wide =
    kind.type === 'commission' ||
    kind.type === 'photoEdit' ||
    (kind.type === 'tool' && kind.tool === 'connect');
  const medium =
    kind.type === 'photo' ||
    kind.type === 'invoice' ||
    kind.type === 'folder' ||
    kind.type === 'settings' ||
    // The Finder lists four columns; at the small size they would crush.
    (kind.type === 'tool' && kind.tool === 'finder');

  const width = wide ? 1180 : medium ? 860 : 700;
  const height = wide ? 760 : medium ? 680 : 560;

  // The viewport here is the desktop area a window actually lives in — the
  // system bar and the dock are already off it — so the margin left over is
  // breathing room, not an allowance for chrome that is somewhere else.
  return {
    width: Math.min(width, Math.max(MIN_WIDTH, viewport.width - 80)),
    height: Math.min(height, Math.max(MIN_HEIGHT, viewport.height - 80)),
  };
}

/**
 * Where a new window lands. Each one steps down and right from the last so a
 * stack of windows is visibly a stack, and wraps back to the top before it
 * can walk off the screen.
 */
export function cascadeRect(
  count: number,
  viewport: { width: number; height: number },
  size?: { width: number; height: number },
): Rect {
  const step = 30;
  const wraps = 6;
  const offset = (count % wraps) * step;

  const width = size?.width ?? Math.min(1180, Math.max(MIN_WIDTH, viewport.width - 260));
  const height = size?.height ?? Math.min(760, Math.max(MIN_HEIGHT, viewport.height - 200));

  // Kept on screen: a window opening half off the right edge is a bug even
  // when the cascade offset is what put it there.
  const x = Math.min(
    Math.max(16, Math.round(viewport.width * 0.12) + offset),
    Math.max(16, viewport.width - width - 16),
  );
  // The same for the bottom, which is the edge that actually bit: the desktop
  // clips what hangs past it, so a window walked down by the cascade lost its
  // bottom border and its resize grip with no scrollbar to get them back.
  const y = Math.min(44 + offset, Math.max(8, viewport.height - height - 16));

  return { x, y, width, height };
}

/**
 * Opens a window, or focuses the existing one for the same subject.
 * Returns the new list and the id that is now focused.
 */
export function openWindow(
  windows: WindowState[],
  spec: { kind: WindowKind; title: string; subtitle?: string | null; rect?: Rect },
  viewport: { width: number; height: number },
): { windows: WindowState[]; id: string } {
  const key = keyFor(spec.kind);
  const existing = windows.find((w) => keyFor(w.kind) === key);

  if (existing) {
    // Already open: raise it, un-minimise it, and refresh its title — the
    // subject may have been renamed since it was opened.
    const raised = windows.map((w) =>
      w.id === existing.id
        ? {
            ...w,
            z: topZ(windows) + 1,
            minimized: false,
            title: spec.title,
            subtitle: spec.subtitle ?? null,
          }
        : w,
    );
    return { windows: raised, id: existing.id };
  }

  const id = `win-${key}-${windows.length}-${Date.now().toString(36)}`;
  const next: WindowState = {
    id,
    kind: spec.kind,
    title: spec.title,
    subtitle: spec.subtitle ?? null,
    rect: spec.rect ?? cascadeRect(windows.length, viewport, defaultSize(spec.kind, viewport)),
    z: topZ(windows) + 1,
    minimized: false,
    restoreRect: null,
  };
  return { windows: [...windows, next], id };
}

export function closeWindow(windows: WindowState[], id: string): WindowState[] {
  return windows.filter((w) => w.id !== id);
}

export function focusWindow(windows: WindowState[], id: string): WindowState[] {
  const target = windows.find((w) => w.id === id);
  // Already on top and visible: nothing to do, and no pointless re-render.
  if (!target || (target.z === topZ(windows) && !target.minimized)) return windows;
  const z = topZ(windows) + 1;
  return windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w));
}

export function minimizeWindow(windows: WindowState[], id: string): WindowState[] {
  return windows.map((w) => (w.id === id ? { ...w, minimized: true } : w));
}

export function moveWindow(windows: WindowState[], id: string, x: number, y: number): WindowState[] {
  return windows.map((w) =>
    w.id === id
      ? {
          ...w,
          // Never above the system bar, and never dragged off the left edge
          // to where the titlebar could not be grabbed again.
          rect: { ...w.rect, x: Math.max(-w.rect.width + 120, x), y: Math.max(0, y) },
        }
      : w,
  );
}

export function resizeWindow(
  windows: WindowState[],
  id: string,
  width: number,
  height: number,
): WindowState[] {
  return windows.map((w) =>
    w.id === id
      ? {
          ...w,
          rect: {
            ...w.rect,
            width: Math.max(MIN_WIDTH, width),
            height: Math.max(MIN_HEIGHT, height),
          },
          // Resizing by hand means the window is no longer zoomed.
          restoreRect: null,
        }
      : w,
  );
}

/** Fills the screen, or puts the window back exactly where it was. */
export function toggleZoom(
  windows: WindowState[],
  id: string,
  viewport: { width: number; height: number },
): WindowState[] {
  return windows.map((w) => {
    if (w.id !== id) return w;
    if (w.restoreRect) return { ...w, rect: w.restoreRect, restoreRect: null };
    return {
      ...w,
      restoreRect: w.rect,
      rect: { x: 12, y: 8, width: viewport.width - 24, height: viewport.height - 16 },
    };
  });
}

export function isZoomed(window: WindowState): boolean {
  return window.restoreRect !== null;
}

/** Windows in the tray, oldest first, so the strip does not reshuffle. */
export function minimizedWindows(windows: WindowState[]): WindowState[] {
  return windows.filter((w) => w.minimized);
}

/** Keeps every window reachable after the viewport shrinks. */
export function clampToViewport(
  windows: WindowState[],
  viewport: { width: number; height: number },
): WindowState[] {
  return windows.map((w) => {
    const width = Math.min(w.rect.width, Math.max(MIN_WIDTH, viewport.width - 24));
    const height = Math.min(w.rect.height, Math.max(MIN_HEIGHT, viewport.height - 24));
    const x = Math.min(w.rect.x, Math.max(0, viewport.width - 140));
    const y = Math.min(w.rect.y, Math.max(0, viewport.height - 80));
    if (width === w.rect.width && height === w.rect.height && x === w.rect.x && y === w.rect.y) {
      return w;
    }
    return { ...w, rect: { x, y, width, height } };
  });
}

/**
 * What a dock button does: open, focus, or put away.
 *
 * A dock button is a switch for its tool, not just an opener. Three cases,
 * because anything less is annoying in a different way each time:
 *  - Not open: open it.
 *  - Open but buried or minimised: bring it to the front. (Closing something
 *    you cannot currently see would look like the button did nothing.)
 *  - Open and already in front: close it.
 *
 * Closing rather than minimising is deliberate. The tray is for windows you
 * mean to come back to; a dock button can reopen its tool in one click, so a
 * minimised copy of it would only clutter the tray.
 */
export function toggleWindow(
  windows: WindowState[],
  spec: { kind: WindowKind; title: string; subtitle?: string | null },
  viewport: { width: number; height: number },
): { windows: WindowState[]; id: string | null } {
  const key = keyFor(spec.kind);
  const existing = windows.find((w) => keyFor(w.kind) === key);

  if (existing && !existing.minimized && existing.z === topZ(windows)) {
    return { windows: closeWindow(windows, existing.id), id: null };
  }

  return openWindow(windows, spec, viewport);
}
