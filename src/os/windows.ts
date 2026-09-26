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
 *
 * Tabs are windows too. A group of tabs is nothing more than a set of windows
 * that share a `groupId`, and two rules keep it that way: the members share
 * their geometry — moving, resizing, zooming and minimising apply to all of
 * them, so any member's rect *is* the group's rect — and the active tab is
 * simply the member with the highest z, which is the focus rule the rest of
 * this file already runs on. Nothing about a window changes when it becomes a
 * tab, which is why pulling one back out is a single field.
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

/**
 * Where a window has been put by the tiling rather than dragged by hand. A
 * half or a quarter of the desktop, the whole of it, or a cell of a tiled
 * arrangement. See tiling.ts for the geometry.
 */
export type SnapZone =
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'fill'
  | 'tiled';

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
  /**
   * The rect to go back to when un-zooming or un-snapping: the size the artist
   * gave the window by hand. Null when the window is at that size already.
   */
  restoreRect: Rect | null;
  /** Which zone the tiling put it in, or null for a window placed by hand. */
  snap: SnapZone | null;
  /**
   * The tab group this window belongs to, or null when it is a window on its
   * own. Windows sharing an id are drawn as one frame with a tab strip.
   */
  groupId: string | null;
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
    // The catalogue is a wall of pictures; at the small size it is a column.
    (kind.type === 'tool' &&
      (kind.tool === 'connect' || kind.tool === 'artwork' || kind.tool === 'finance'));
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
    // Already open: refresh its title — the subject may have been renamed
    // since — then raise it. Through focusWindow, so a window that is a tab
    // brings its whole frame forward and becomes the tab on top of it.
    const renamed = windows.map((w) =>
      w.id === existing.id ? { ...w, title: spec.title, subtitle: spec.subtitle ?? null } : w,
    );
    return { windows: focusWindow(renamed, existing.id), id: existing.id };
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
    snap: null,
    groupId: null,
  };
  return { windows: [...windows, next], id };
}

export function closeWindow(windows: WindowState[], id: string): WindowState[] {
  return windows.filter((w) => w.id !== id);
}

// --- Tabs -----------------------------------------------------------------

/** Every window drawn in the same frame as this one, in the order they open. */
export function tabsOf(windows: WindowState[], id: string): WindowState[] {
  const target = windows.find((w) => w.id === id);
  if (!target) return [];
  if (!target.groupId) return [target];
  return windows.filter((w) => w.groupId === target.groupId);
}

/** The tab on top of a group: the same highest-z rule as focus. */
export function activeTab(windows: WindowState[], groupId: string): WindowState | null {
  const members = windows.filter((w) => w.groupId === groupId);
  if (members.length === 0) return null;
  return members.reduce((top, w) => (w.z > top.z ? w : top));
}

/**
 * How windows are drawn: one entry per frame. A window on its own is a group
 * of one, so the caller has a single shape to render either way.
 */
export function renderGroups(windows: WindowState[]): { active: WindowState; tabs: WindowState[] }[] {
  const seen = new Set<string>();
  const frames: { active: WindowState; tabs: WindowState[] }[] = [];
  for (const window of windows) {
    if (!window.groupId) {
      frames.push({ active: window, tabs: [window] });
      continue;
    }
    if (seen.has(window.groupId)) continue;
    seen.add(window.groupId);
    const tabs = windows.filter((w) => w.groupId === window.groupId);
    frames.push({ active: activeTab(windows, window.groupId) ?? window, tabs });
  }
  return frames;
}

/**
 * Collects the windows on screen into one frame of tabs.
 *
 * Everything takes the focused window's rect, because that is the one the
 * artist was last looking at and the one they arranged. Minimised windows are
 * left in the tray: they were put away on purpose, and pulling them back out
 * as tabs would be the opposite of what was asked.
 */
export function mergeAll(windows: WindowState[], groupId = `tabs-${Date.now().toString(36)}`): WindowState[] {
  const visible = windows.filter((w) => !w.minimized);
  if (visible.length < 2) return windows;
  const lead = visible.reduce((top, w) => (w.z > top.z ? w : top));
  return windows.map((w) =>
    w.minimized
      ? w
      : { ...w, groupId, rect: { ...lead.rect }, restoreRect: lead.restoreRect, snap: lead.snap },
  );
}

/**
 * Takes one tab back out into a window of its own, stepped down and right so
 * it is visibly a second window rather than looking like nothing happened.
 * A group of one is not a group, so the tab left behind is freed too.
 */
export function pullOutTab(
  windows: WindowState[],
  id: string,
  viewport: { width: number; height: number },
): WindowState[] {
  const target = windows.find((w) => w.id === id);
  if (!target?.groupId) return windows;
  const left = windows.filter((w) => w.groupId === target.groupId && w.id !== id);
  const orphan = left.length === 1 ? left[0]!.id : null;
  const z = topZ(windows) + 1;
  const rect = {
    ...target.rect,
    x: Math.min(target.rect.x + 34, Math.max(16, viewport.width - target.rect.width - 16)),
    y: Math.min(target.rect.y + 34, Math.max(8, viewport.height - target.rect.height - 16)),
  };
  return windows.map((w) => {
    if (w.id === id) return { ...w, groupId: null, rect, z, restoreRect: null, snap: null };
    if (w.id === orphan) return { ...w, groupId: null };
    return w;
  });
}

/**
 * How deep into a frame a drop counts as "make this a tab", measured from its
 * top edge. Roughly the titlebar and the strip under it: dropping anywhere
 * else on a window is just a window landing on top of another one, which is
 * what dragging has always done.
 */
export const TAB_DROP_HEIGHT = 74;

/**
 * The frame a dragged window would join if it were let go here, or null.
 *
 * Point is in the desktop's own coordinates, the same ones a rect is in. A
 * window is never a drop target for itself or for anything already in its
 * frame, and the topmost frame wins where two overlap — the one being dropped
 * on is the one that can be seen.
 */
export function dropTargetAt(
  windows: WindowState[],
  draggedId: string,
  point: { x: number; y: number },
): WindowState | null {
  const dragged = windows.find((w) => w.id === draggedId);
  if (!dragged) return null;
  const own = new Set(tabsOf(windows, draggedId).map((w) => w.id));

  const candidates = windows.filter((w) => {
    if (w.minimized || own.has(w.id)) return false;
    const { x, y, width } = w.rect;
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + TAB_DROP_HEIGHT;
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((top, w) => (w.z > top.z ? w : top));
}

/**
 * Drops one window onto another as a tab. A dragged frame brings its own tabs
 * with it — dropping a group onto a window merges both, which is the only
 * reading that does not silently leave windows behind.
 */
export function mergeInto(
  windows: WindowState[],
  sourceId: string,
  targetId: string,
): WindowState[] {
  const source = windows.find((w) => w.id === sourceId);
  const target = windows.find((w) => w.id === targetId);
  if (!source || !target || source.id === target.id) return windows;
  if (source.groupId && source.groupId === target.groupId) return windows;

  const groupId = target.groupId ?? `tabs-${Date.now().toString(36)}`;
  const moving = new Set(tabsOf(windows, sourceId).map((w) => w.id));
  const joining = new Set(tabsOf(windows, targetId).map((w) => w.id));
  const base = topZ(windows) + 1;

  return windows.map((w) => {
    if (moving.has(w.id)) {
      // The dropped window lands on top of the frame it joined; anything it
      // brought with it sits behind, in the order it already had.
      return {
        ...w,
        groupId,
        rect: { ...target.rect },
        restoreRect: target.restoreRect,
        snap: target.snap,
        minimized: false,
        z: w.id === sourceId ? base + 1 : base,
      };
    }
    if (joining.has(w.id)) return { ...w, groupId };
    return w;
  });
}

/** The tab to move to, one step either way, wrapping round the strip. */
export function stepTab(windows: WindowState[], id: string, by: number): string {
  const tabs = tabsOf(windows, id);
  if (tabs.length < 2) return id;
  const at = tabs.findIndex((w) => w.id === id);
  return tabs[(at + by + tabs.length) % tabs.length]!.id;
}

/** The ids a change of geometry applies to: a whole group, or one window. */
function familyOf(windows: WindowState[], id: string): Set<string> {
  return new Set(tabsOf(windows, id).map((w) => w.id));
}

// --- Focus, geometry ------------------------------------------------------

/**
 * Focusing a tab raises its whole frame — the others would be drawn behind
 * their own group otherwise — and leaves the focused one highest, which is
 * what makes it the active tab.
 */
export function focusWindow(windows: WindowState[], id: string): WindowState[] {
  const target = windows.find((w) => w.id === id);
  if (!target) return windows;
  const family = familyOf(windows, id);
  const alreadyTop = target.z === topZ(windows) && !target.minimized;
  if (alreadyTop && family.size === 1) return windows;
  const base = topZ(windows) + 1;
  return windows.map((w) => {
    if (w.id === id) return { ...w, z: base + 1, minimized: false };
    if (family.has(w.id)) return { ...w, z: base, minimized: false };
    return w;
  });
}

export function minimizeWindow(windows: WindowState[], id: string): WindowState[] {
  const family = familyOf(windows, id);
  return windows.map((w) => (family.has(w.id) ? { ...w, minimized: true } : w));
}

export function moveWindow(windows: WindowState[], id: string, x: number, y: number): WindowState[] {
  const family = familyOf(windows, id);
  return windows.map((w) =>
    family.has(w.id)
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
  const family = familyOf(windows, id);
  return windows.map((w) =>
    family.has(w.id)
      ? {
          ...w,
          rect: {
            ...w.rect,
            width: Math.max(MIN_WIDTH, width),
            height: Math.max(MIN_HEIGHT, height),
          },
          // Resizing by hand means the window is no longer zoomed or snapped.
          restoreRect: null,
          snap: null,
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
  const family = familyOf(windows, id);
  return windows.map((w) => {
    if (!family.has(w.id)) return w;
    if (w.restoreRect) return { ...w, rect: w.restoreRect, restoreRect: null, snap: null };
    return {
      ...w,
      restoreRect: w.rect,
      snap: 'fill' as const,
      rect: { x: 12, y: 8, width: viewport.width - 24, height: viewport.height - 16 },
    };
  });
}

/** Zoomed, snapped or tiled: anywhere but the size it was given by hand. */
export function isZoomed(window: WindowState): boolean {
  return window.restoreRect !== null;
}

/**
 * The windows to put back after a reload.
 *
 * Two jobs. First, what came out of storage is untrusted: it can be hand
 * edited, or written by an older version of the app, so anything that is not
 * a window is dropped rather than crashing the desktop. Second, a window is a
 * view onto a record — a commission that has since been deleted has nothing
 * to show, so it is dropped too rather than opening onto an apology.
 *
 * `subjectExists` answers for the record kinds; tools and lists have no
 * record behind them and are always kept.
 */
export function restorable(
  stored: unknown,
  subjectExists: (kind: WindowKind) => boolean,
): WindowState[] {
  if (!Array.isArray(stored)) return [];

  const kept: WindowState[] = [];
  for (const entry of stored) {
    const window = asWindow(entry);
    if (!window) continue;
    if (!subjectExists(window.kind)) continue;
    // A window whose subject is already in the list is a duplicate, not a
    // second view of it.
    if (kept.some((w) => keyFor(w.kind) === keyFor(window.kind))) continue;
    kept.push(window);
  }

  // Renumbered from the order they were stacked in, so a stored z of 4,000
  // after a long session does not carry over.
  const ordered = [...kept].sort((a, b) => a.z - b.z);
  const zOf = new Map(ordered.map((w, index) => [w.id, index + 1]));

  // A group of one is not a group — its other tabs may not have survived.
  const counts = new Map<string, number>();
  for (const w of kept) if (w.groupId) counts.set(w.groupId, (counts.get(w.groupId) ?? 0) + 1);

  return kept.map((w) => ({
    ...w,
    z: zOf.get(w.id) ?? 1,
    groupId: w.groupId && (counts.get(w.groupId) ?? 0) > 1 ? w.groupId : null,
  }));
}

/** Storage is untrusted input: anything not shaped like a window is dropped. */
function asWindow(value: unknown): WindowState | null {
  if (typeof value !== 'object' || value === null) return null;
  const w = value as Partial<WindowState>;
  if (typeof w.id !== 'string' || typeof w.title !== 'string') return null;
  if (!isRect(w.rect)) return null;
  if (w.restoreRect !== null && w.restoreRect !== undefined && !isRect(w.restoreRect)) return null;
  if (typeof w.kind !== 'object' || w.kind === null || typeof w.kind.type !== 'string') return null;
  if (!KIND_TYPES.has(w.kind.type)) return null;
  return {
    id: w.id,
    kind: w.kind,
    title: w.title,
    subtitle: typeof w.subtitle === 'string' ? w.subtitle : null,
    rect: w.rect,
    z: typeof w.z === 'number' && Number.isFinite(w.z) ? w.z : 1,
    minimized: w.minimized === true,
    restoreRect: w.restoreRect ?? null,
    // A zone is only kept alongside the rect to go back to: without one there
    // is nothing to restore, and the window is simply where it is.
    snap: w.restoreRect && typeof w.snap === 'string' && SNAP_ZONES.has(w.snap) ? w.snap : null,
    groupId: typeof w.groupId === 'string' ? w.groupId : null,
  };
}

const SNAP_ZONES = new Set<string>([
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'fill',
  'tiled',
] satisfies SnapZone[]);

const KIND_TYPES = new Set<WindowKind['type']>([
  'commission',
  'invoice',
  'folder',
  'photo',
  'photoEdit',
  'list',
  'settings',
  'tool',
]);

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false;
  const rect = value as Partial<Rect>;
  return (['x', 'y', 'width', 'height'] as const).every(
    (key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]),
  );
}

/**
 * Windows in the tray, oldest first, so the strip does not reshuffle. A
 * minimised group is one entry, not one per tab: it went away as a frame and
 * it comes back as a frame.
 */
export function minimizedWindows(windows: WindowState[]): WindowState[] {
  const seen = new Set<string>();
  return windows.filter((w) => {
    if (!w.minimized) return false;
    if (!w.groupId) return true;
    if (seen.has(w.groupId)) return false;
    seen.add(w.groupId);
    return true;
  });
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
