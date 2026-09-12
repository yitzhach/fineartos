/**
 * Undo.
 *
 * A stack of things that have been done, each carrying the way to put it
 * back. The rules are what make it trustworthy rather than surprising:
 *
 *  - Only reversible things go on the stack. Emptying the Trash is not on it,
 *    and never will be: an undo that sometimes cannot undo is worse than no
 *    undo, because people stop reading the warning that matters.
 *  - Every entry says what it would undo, so the button can name it.
 *  - The stack is capped. A thousand remembered moves is a memory leak, not a
 *    feature; nobody has ever pressed undo forty times on purpose.
 *  - Undoing is itself not redoable. Redo is a separate thing and this does
 *    not pretend to have it.
 *
 * DOM-free, like the rest of the model layer. The undo functions themselves
 * are closures the caller supplies — this file only decides what is kept.
 */

export interface UndoEntry {
  /** Named from the doer's point of view: "Move", "File into Bobs project". */
  label: string;
  /** Puts it back. May be async — most of these touch storage. */
  undo: () => void | Promise<void>;
}

export type UndoStack = UndoEntry[];

/** Deep enough for a bad five minutes, shallow enough to stay honest. */
export const UNDO_LIMIT = 30;

export function pushUndo(stack: UndoStack, entry: UndoEntry): UndoStack {
  // Newest last, oldest dropped: an array used as a stack, capped at the top.
  const next = [...stack, entry];
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next;
}

export function canUndo(stack: UndoStack): boolean {
  return stack.length > 0;
}

/** What the next undo would put back, or null when there is nothing to undo. */
export function nextUndoLabel(stack: UndoStack): string | null {
  return stack.length > 0 ? stack[stack.length - 1]!.label : null;
}

/** Takes the top entry off, returning it and the shortened stack. */
export function popUndo(stack: UndoStack): { entry: UndoEntry | null; stack: UndoStack } {
  if (stack.length === 0) return { entry: null, stack };
  return { entry: stack[stack.length - 1]!, stack: stack.slice(0, -1) };
}

/**
 * Whether a keystroke means undo.
 *
 * Cmd+Z on a Mac, Ctrl+Z elsewhere — and never while the caret is in a text
 * box, where the browser's own undo is the right one and stealing it would
 * lose a half-typed sentence. Shift+Cmd+Z is redo on every platform, so it is
 * deliberately not treated as undo.
 */
export function isUndoKey(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target?: unknown;
}): boolean {
  if (event.key.toLowerCase() !== 'z') return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  if (event.shiftKey) return false;
  return !isTextEntry(event.target);
}

/** True for anything the artist could be typing into. */
export function isTextEntry(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  const tag = element.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return element.isContentEditable === true;
}
