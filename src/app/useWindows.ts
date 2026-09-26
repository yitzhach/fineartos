/**
 * The windows on the desktop: where they are, dragging and snapping them,
 * tiling, and keeping the arrangement for the next visit. The geometry is in
 * os/windows.ts and os/tiling.ts; this is the state that holds it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  anySnapped,
  cascadeAll,
  resnap,
  snapByArrow,
  snapWindow,
  tileAll,
  unsnapWindow,
  untileAll,
  visibleFrames,
  zoneAt,
  type Arrow,
  type TileLayout,
  type Zone,
} from '../os/tiling';
import {
  clampToViewport,
  closeWindow,
  closeWindowsOnto,
  dropTargetAt,
  focused as focusedWindow,
  focusWindow,
  mergeAll,
  mergeInto,
  minimizedWindows,
  minimizeWindow,
  moveWindow,
  openWindow,
  pullOutTab,
  resizeWindow,
  toggleWindow,
  toggleZoom,
  type WindowKind,
  type WindowState,
} from '../os/windows';
import { loadAutoTile, loadTileLayout, saveAutoTile, saveTileLayout, saveWindows } from '../lib/prefs';

/** Below this width a window becomes a full-screen sheet, not a window. */
export const COMPACT_WIDTH = 860;

export function useWindows(options: { loaded: boolean; restoreWindowsOn: boolean }) {
  const { loaded, restoreWindowsOn } = options;
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const compact = viewport.width <= COMPACT_WIDTH;
  /**
   * The desktop surface's own size, reported by Desktop. Smaller than the
   * browser window — the system bar is above it and the dock below — and it
   * is what the icon grid is laid out against, so Tidy up must use the same
   * number.
   *
   * Windows are measured against it too. They are drawn inside this surface,
   * which clips what hangs past it, so sizing them against the browser window
   * cut the bottom off every tall one: no border, no resize grip, and no
   * scrollbar to reach them with.
   */
  const desktopViewportRef = useRef(viewport);
  // Read during a drag and by the shell's keys, which must see the windows as
  // they are now.
  const windowsRef = useRef(windows);
  useEffect(() => {
    windowsRef.current = windows;
  }, [windows]);

  const [autoTile, setAutoTile] = useState<boolean>(loadAutoTile);
  const [tileLayout, setTileLayout] = useState<TileLayout>(loadTileLayout);
  /** Read when the desktop changes size, from a handler made once. */
  const tileLayoutRef = useRef(tileLayout);
  useEffect(() => saveAutoTile(autoTile), [autoTile]);
  useEffect(() => {
    saveTileLayout(tileLayout);
    tileLayoutRef.current = tileLayout;
  }, [tileLayout]);

  /**
   * The zone a window being dragged would snap into if let go now: drawn as
   * a preview while the drag lasts. The ref is what the release reads.
   */
  const [snapPreview, setSnapPreview] = useState<Zone | null>(null);
  const snapZoneRef = useRef<Zone | null>(null);
  /**
   * The frame a window being dragged would join as a tab if it were let go
   * now, and the element the pointer is measured against — a rect is in the
   * desktop's coordinates and a pointer is in the page's.
   */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const desktopRef = useRef<HTMLElement>(null);

  /**
   * The arrangement, kept so a reload picks the work back up. Written on a
   * short delay because a drag changes the windows on every frame, and there
   * is no reason to write to storage sixty times a second.
   */
  useEffect(() => {
    if (!loaded) return undefined;
    const timer = setTimeout(() => saveWindows(restoreWindowsOn ? windows : []), 400);
    return () => clearTimeout(timer);
  }, [loaded, restoreWindowsOn, windows]);

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      // The windows follow the desktop surface in, not the browser window —
      // see onDesktopViewport below, which the same resize triggers.
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** The desktop surface has been measured, or has changed size. */
  const onDesktopViewport = useCallback((size: { width: number; height: number }) => {
    const previous = desktopViewportRef.current;
    desktopViewportRef.current = size;
    if (previous.width === size.width && previous.height === size.height) return;
    // Windows follow the surface in, so none is left unreachable or clipped,
    // and a snapped or tiled window keeps its share of the new size.
    setWindows((current) => resnap(clampToViewport(current, size), size, tileLayoutRef.current));
  }, []);

  const open = useCallback((kind: WindowKind, title: string, subtitle?: string | null) => {
    setWindows(
      (current) => openWindow(current, { kind, title, subtitle }, desktopViewportRef.current).windows,
    );
  }, []);

  /** A dock button: open the tool, bring it forward, or put it away. */
  const toggle = useCallback((spec: { kind: WindowKind; title: string; subtitle: string }) => {
    setWindows((c) => toggleWindow(c, spec, desktopViewportRef.current).windows);
  }, []);

  const focusWin = useCallback((id: string) => setWindows((c) => focusWindow(c, id)), []);
  const closeWin = useCallback((id: string) => setWindows((c) => closeWindow(c, id)), []);
  const minimizeWin = useCallback((id: string) => setWindows((c) => minimizeWindow(c, id)), []);
  const zoomWin = useCallback(
    (id: string) => setWindows((c) => toggleZoom(c, id, desktopViewportRef.current)),
    [],
  );
  const resizeWin = useCallback(
    (id: string, width: number, height: number) => setWindows((c) => resizeWindow(c, id, width, height)),
    [],
  );
  const pullOut = useCallback(
    (id: string) => setWindows((c) => pullOutTab(c, id, desktopViewportRef.current)),
    [],
  );
  /** Windows onto records that have just been hidden or destroyed. */
  const closeWindowsFor = useCallback((ids: string[]) => setWindows((c) => closeWindowsOnto(c, ids)), []);

  /** Show the desktop: everything goes to the tray, nothing is lost. */
  const showDesktop = useCallback(() => setWindows((c) => c.map((w) => ({ ...w, minimized: true }))), []);

  /**
   * A window being dragged by its titlebar. Pushed against an edge of the
   * desktop, the zone it would snap into is drawn; over the top of another
   * frame, that frame lights up to take it as a tab. The edge wins where both
   * could apply: pushing at the side of the screen is a request, brushing a
   * titlebar on the way there is not.
   */
  const onDragWindow = useCallback((id: string, point: { x: number; y: number }) => {
    const surface = desktopRef.current?.getBoundingClientRect();
    if (!surface) return;
    const local = { x: point.x - surface.left, y: point.y - surface.top };

    const zone = zoneAt(local, desktopViewportRef.current);
    if (zone !== snapZoneRef.current) {
      snapZoneRef.current = zone;
      setSnapPreview(zone);
    }

    const target = zone ? null : (dropTargetAt(windowsRef.current, id, local)?.id ?? null);
    if (target !== dropTargetRef.current) {
      dropTargetRef.current = target;
      setDropTarget(target);
    }
  }, []);

  /**
   * Let go. The frame moved itself during the drag; this is the one time the
   * desktop hears where it ended up, and decides what that means: a snap, a
   * tab, or a window that has been moved — at its own size again, if it had
   * been snapped when it was picked up.
   */
  const onDragEndWindow = useCallback((id: string, to: { x: number; y: number }) => {
    const zone = snapZoneRef.current;
    const target = dropTargetRef.current;
    snapZoneRef.current = null;
    dropTargetRef.current = null;
    setSnapPreview(null);
    setDropTarget(null);
    if (zone) setWindows((current) => snapWindow(current, id, zone, desktopViewportRef.current));
    else if (target) setWindows((current) => mergeInto(current, id, target));
    else setWindows((current) => moveWindow(unsnapWindow(current, id), id, to.x, to.y));
  }, []);

  /** A window's own snap menu. */
  const snapWin = useCallback((id: string, zone: Zone | 'restore') => {
    setWindows((c) =>
      zone === 'restore'
        ? unsnapWindow(c, id)
        : focusWindow(snapWindow(c, id, zone, desktopViewportRef.current), id),
    );
  }, []);

  /** Alt+Shift and an arrow, on the window in front. Nothing to do on a phone. */
  const snapFront = (arrow: Arrow) => {
    if (compact) return;
    const front = focusedWindow(windowsRef.current);
    if (!front) return;
    const next = snapByArrow(front.snap, arrow);
    if (next === null) return;
    setWindows((c) =>
      next === 'restore' ? unsnapWindow(c, front.id) : snapWindow(c, front.id, next, desktopViewportRef.current),
    );
  };

  /** Straight into a zone, whatever the window was doing: the search box's snaps. */
  const snapFrontTo = useCallback((zone: Zone) => {
    const front = focusedWindow(windowsRef.current);
    if (front) setWindows((c) => snapWindow(c, front.id, zone, desktopViewportRef.current));
  }, []);

  /** Ctrl/⌘ + Alt + an arrow, or Alt and a number: another tab of the frame in front. */
  const focusTab = useCallback((id: string) => setWindows((c) => focusWindow(c, id)), []);

  const tile = useCallback((layout: TileLayout) => {
    setTileLayout(layout);
    setWindows((c) => tileAll(c, layout, desktopViewportRef.current, focusedWindow(c)?.id ?? null));
  }, []);
  const cascade = useCallback(() => setWindows((c) => cascadeAll(c, desktopViewportRef.current)), []);
  const untile = useCallback(() => setWindows(untileAll), []);
  const merge = useCallback(() => setWindows((c) => mergeAll(c)), []);

  const frames = visibleFrames(windows);

  /**
   * Auto-tiling: whenever a frame opens, closes, comes back from the tray or
   * joins a group, everything on screen is laid out again. A lone window is
   * given back its own size — a single tile filling the screen is just a
   * zoomed window nobody asked for.
   */
  const frameKey = frames
    .map((frame) => frame.groupId ?? frame.id)
    .sort()
    .join('|');
  useEffect(() => {
    if (!autoTile || compact || !loaded) return;
    setWindows((c) =>
      visibleFrames(c).length < 2
        ? untileAll(c)
        : tileAll(c, tileLayoutRef.current, desktopViewportRef.current, focusedWindow(c)?.id ?? null),
    );
  }, [autoTile, compact, frameKey, loaded]);

  return {
    windows,
    /** For putting back the arrangement on the first read, and nothing else. */
    setWindows,
    windowsRef,
    viewport,
    compact,
    desktopViewportRef,
    desktopRef,
    top: focusedWindow(windows),
    tray: minimizedWindows(windows),
    frames,
    snapped: anySnapped(windows),
    snapPreview,
    dropTarget,
    autoTile,
    setAutoTile,
    tileLayout,
    onDesktopViewport,
    open,
    toggle,
    focusWin,
    closeWin,
    minimizeWin,
    zoomWin,
    resizeWin,
    pullOut,
    closeWindowsFor,
    showDesktop,
    onDragWindow,
    onDragEndWindow,
    snapWin,
    snapFront,
    snapFrontTo,
    focusTab,
    tile,
    cascade,
    untile,
    merge,
  };
}
