/**
 * The search box and the shell's own keys, in one place so they cannot
 * fight:
 *  - ⌘K or Ctrl+K anywhere, and / when not typing: the search box.
 *  - ? when not typing: the shortcut sheet.
 *  - Ctrl/⌘ + Alt + an arrow steps through the tabs of the frame in front.
 *    Not Ctrl+Tab: browsers keep that one for their own tabs. Alt with a
 *    number jumps straight to a tab.
 *  - Alt + Shift + an arrow snaps the window in front (tiling.ts).
 *  - G, then a letter, opens a tool (launcher.ts).
 * A key typed into a field is left to the field — except ⌘K, which is
 * deliberate enough to mean the search box wherever the cursor is.
 *
 * Everything is decided from refs, here, before the handler returns. A
 * state updater runs later, after the browser has already acted on the
 * key, so a preventDefault inside one never prevented anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  actionEntries,
  goStep,
  recordEntries,
  toolEntries,
  type GoState,
  type LauncherContext,
  type LauncherEntry,
  type LauncherRecords,
} from '../os/launcher';
import type { Arrow } from '../os/tiling';
import { focused as focusedWindow, stepTab, tabsOf, type WindowState } from '../os/windows';

export function useShellKeys(options: {
  /** The preview owns the keys while it is open. */
  previewOpenRef: MutableRefObject<boolean>;
  windowsRef: MutableRefObject<WindowState[]>;
  focusTab: (id: string) => void;
  openTool: (id: string) => void;
  snapFront: (arrow: Arrow) => void;
}) {
  /** Goes up by one each time ⌘K, Ctrl+K or / asks for the search box. */
  const [launcherSummon, setLauncherSummon] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** The sheet owns the keys while it is open, the way the preview does. */
  const shortcutsOpenRef = useRef(false);
  const goRef = useRef<GoState>({ armedAt: null });
  // Made afresh each render; the handler below is made once and reads these.
  const actions = useRef(options);
  actions.current = options;

  const openShortcuts = useCallback(() => {
    shortcutsOpenRef.current = true;
    setShortcutsOpen(true);
  }, []);
  const closeShortcuts = useCallback(() => {
    shortcutsOpenRef.current = false;
    setShortcutsOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { previewOpenRef, windowsRef, focusTab, openTool, snapFront } = actions.current;
      if (previewOpenRef.current || shortcutsOpenRef.current) return;
      const mod = event.ctrlKey || event.metaKey;
      const typing = isTypingTarget(event.target);

      if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setLauncherSummon((n) => n + 1);
        return;
      }
      if (!typing && !mod && !event.altKey && event.key === '/') {
        event.preventDefault();
        setLauncherSummon((n) => n + 1);
        return;
      }
      if (!typing && !mod && !event.altKey && event.key === '?') {
        event.preventDefault();
        shortcutsOpenRef.current = true;
        setShortcutsOpen(true);
        return;
      }

      const current = windowsRef.current;
      if (mod && event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        const front = focusedWindow(current);
        if (!front) return;
        event.preventDefault();
        const next = stepTab(current, front.id, event.key === 'ArrowRight' ? 1 : -1);
        if (next !== front.id) focusTab(next);
        return;
      }
      if (event.altKey && !mod && !event.shiftKey && /^[1-9]$/.test(event.key)) {
        const front = focusedWindow(current);
        if (!front) return;
        const tabs = tabsOf(current, front.id);
        const wanted = tabs[Number(event.key) - 1];
        if (!wanted || tabs.length < 2) return;
        event.preventDefault();
        focusTab(wanted.id);
        return;
      }

      const arrow = ARROWS[event.key];
      if (arrow && event.altKey && event.shiftKey && !mod && !typing) {
        event.preventDefault();
        snapFront(arrow);
        return;
      }

      if (!typing && !mod && !event.altKey && event.key.length === 1) {
        const step = goStep(goRef.current, event.key, Date.now());
        goRef.current = step.state;
        if (step.consumed) event.preventDefault();
        if (step.tool) openTool(step.tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { launcherSummon, shortcutsOpen, openShortcuts, closeShortcuts };
}

/**
 * Everything the search box can offer right now. Remade only when something
 * it shows has changed, not on every render of the shell.
 */
export function useLauncherEntries(context: LauncherContext, records: LauncherRecords): LauncherEntry[] {
  const { frames, hasFocused, compact, undoLabel, theme, fullscreen, autoTile, snapped, mac } = context;
  const { documents, invoices, projects, photos, shows, guests } = records;
  return useMemo(
    () => [
      ...toolEntries(),
      ...actionEntries({ frames, hasFocused, compact, undoLabel, theme, fullscreen, autoTile, snapped, mac }),
      ...recordEntries({ documents, invoices, projects, photos, shows, guests }),
    ],
    [
      frames,
      hasFocused,
      compact,
      undoLabel,
      theme,
      fullscreen,
      autoTile,
      snapped,
      mac,
      documents,
      invoices,
      projects,
      photos,
      shows,
      guests,
    ],
  );
}

const ARROWS: Record<string, Arrow | undefined> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** A key pressed here belongs to what is being typed, not to the shell. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes(
      target.type,
    );
  }
  return false;
}
