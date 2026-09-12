import { describe, expect, it, vi } from 'vitest';
import {
  canUndo,
  isTextEntry,
  isUndoKey,
  nextUndoLabel,
  popUndo,
  pushUndo,
  UNDO_LIMIT,
  type UndoStack,
} from '../undo';

const entry = (label: string, undo = () => {}) => ({ label, undo });

describe('the stack', () => {
  it('has nothing to undo to begin with', () => {
    expect(canUndo([])).toBe(false);
    expect(nextUndoLabel([])).toBeNull();
  });

  it('undoes the most recent thing first', () => {
    const stack = pushUndo(pushUndo([], entry('Move')), entry('File into Bobs project'));
    expect(nextUndoLabel(stack)).toBe('File into Bobs project');
    const { entry: top, stack: rest } = popUndo(stack);
    expect(top?.label).toBe('File into Bobs project');
    expect(nextUndoLabel(rest)).toBe('Move');
  });

  it('forgets the oldest rather than growing forever', () => {
    let stack: UndoStack = [];
    for (let i = 0; i < UNDO_LIMIT + 5; i += 1) stack = pushUndo(stack, entry(`Move ${i}`));
    expect(stack).toHaveLength(UNDO_LIMIT);
    expect(stack[0]!.label).toBe('Move 5');
    expect(nextUndoLabel(stack)).toBe(`Move ${UNDO_LIMIT + 4}`);
  });

  it('popping an empty stack is not an error', () => {
    expect(popUndo([]).entry).toBeNull();
  });

  it('runs the function the entry carried', async () => {
    const put = vi.fn();
    const { entry: top } = popUndo(pushUndo([], entry('Move', put)));
    await top?.undo();
    expect(put).toHaveBeenCalledOnce();
  });
});

describe('isUndoKey', () => {
  const key = (over = {}) => ({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false, ...over });

  it('is Cmd+Z', () => {
    expect(isUndoKey(key())).toBe(true);
  });

  it('is Ctrl+Z too', () => {
    expect(isUndoKey(key({ metaKey: false, ctrlKey: true }))).toBe(true);
  });

  it('is not plain Z', () => {
    expect(isUndoKey(key({ metaKey: false }))).toBe(false);
  });

  it('is not Shift+Cmd+Z, which means redo', () => {
    expect(isUndoKey(key({ shiftKey: true }))).toBe(false);
  });

  it('leaves the browser its own undo inside a text box', () => {
    expect(isUndoKey(key({ target: { tagName: 'INPUT' } }))).toBe(false);
    expect(isUndoKey(key({ target: { tagName: 'TEXTAREA' } }))).toBe(false);
    expect(isUndoKey(key({ target: { isContentEditable: true } }))).toBe(false);
  });

  it('still works with the pointer over an ordinary button', () => {
    expect(isUndoKey(key({ target: { tagName: 'BUTTON' } }))).toBe(true);
  });
});

describe('isTextEntry', () => {
  it('says no to nothing at all', () => {
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry(undefined)).toBe(false);
  });
});
