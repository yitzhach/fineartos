/**
 * What ⌘Z or Ctrl+Z would put back. Only reversible things go on here —
 * emptying the Trash is deliberately absent, because an undo that sometimes
 * cannot undo teaches people to ignore the warning that matters.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isUndoKey, nextUndoLabel, popUndo, pushUndo, type UndoStack } from '../os/undo';

export function useUndo(say: (text: string) => void) {
  const [undoStack, setUndoStack] = useState<UndoStack>([]);
  /**
   * The stack itself. React's state updaters do not run synchronously, so
   * reading the top entry out of one gave nothing and undo silently did
   * nothing at all — caught by the browser test. The ref is the truth; the
   * state above exists only so the Undo button can render its label.
   */
  const undoRef = useRef<UndoStack>([]);

  const pushUndoEntry = useCallback((label: string, undo: () => void | Promise<void>) => {
    undoRef.current = pushUndo(undoRef.current, { label, undo });
    setUndoStack(undoRef.current);
  }, []);

  const undoLast = useCallback(async () => {
    // Taken off the stack before it runs, so a double-tap cannot run the same
    // undo twice.
    const { entry, stack } = popUndo(undoRef.current);
    undoRef.current = stack;
    setUndoStack(stack);
    if (!entry) return;
    await entry.undo();
    say(`Undone: ${entry.label.toLowerCase()}.`);
  }, [say]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isUndoKey(event)) return;
      event.preventDefault();
      void undoLast();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoLast]);

  return { undoLabel: nextUndoLabel(undoStack), pushUndoEntry, undoLast };
}
