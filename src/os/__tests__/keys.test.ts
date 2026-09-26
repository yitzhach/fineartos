import { describe, expect, it } from 'vitest';
import { isApplePlatform, keyNames, keyText, undoKeys } from '../keys';
import { shortcutGroups, typingNote } from '../shortcuts';
import { GO_KEYS, actionEntries, type LauncherContext } from '../launcher';

describe('key names', () => {
  it('knows an Apple device by its user agent', () => {
    expect(isApplePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe(true);
    expect(isApplePlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(isApplePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isApplePlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });

  it('draws a chord the way each platform does', () => {
    expect(keyText(['⌘', 'Z'], true)).toBe('⌘Z');
    expect(keyText(['Ctrl', 'Z'], false)).toBe('Ctrl+Z');
    expect(undoKeys(true)).toBe('⌘Z');
    expect(undoKeys(false)).toBe('Ctrl+Z');
    expect(keyNames(false)).toMatchObject({ mod: 'Ctrl', alt: 'Alt', shift: 'Shift' });
    expect(keyNames(true)).toMatchObject({ mod: '⌘', alt: '⌥', shift: '⇧' });
  });
});

const everyKey = (mac: boolean, compact = false) =>
  shortcutGroups({ mac, compact }).flatMap((group) => group.shortcuts.flatMap((s) => s.keys.flat()));

describe('the shortcut sheet', () => {
  it('never shows Mac keys off a Mac, nor PC keys on one', () => {
    const pc = [...everyKey(false), typingNote(false)].join(' ');
    expect(pc).not.toMatch(/[⌘⌥⇧⌫]/);
    const mac = [...everyKey(true), typingNote(true)].join(' ');
    expect(mac).not.toMatch(/\bCtrl\b|\bAlt\b/);
    expect(typingNote(true)).toContain('⌘K');
    expect(typingNote(false)).toContain('Ctrl+K');
  });

  it('lists every G sequence, and the tool it opens', () => {
    const go = shortcutGroups({ mac: false, compact: false }).find((group) => group.title === 'Go to a tool');
    expect(go?.shortcuts).toHaveLength(Object.keys(GO_KEYS).length);
    expect(go?.shortcuts).toContainEqual({ keys: [['G', 'B']], what: 'Finance' });
    expect(go?.shortcuts).toContainEqual({ keys: [['G', 'H']], what: 'Home — show the desktop' });
  });

  it('leaves out snapping on a phone, where it does nothing', () => {
    const snaps = (compact: boolean) =>
      shortcutGroups({ mac: false, compact })
        .flatMap((group) => group.shortcuts)
        .filter((s) => s.what.startsWith('Snap'));
    expect(snaps(false)).toHaveLength(1);
    expect(snaps(true)).toHaveLength(0);
  });

  it('can be found in the search box, except on a phone', () => {
    const context: LauncherContext = {
      frames: 0,
      hasFocused: false,
      compact: false,
      undoLabel: null,
      theme: 'dark',
      fullscreen: 'off',
      autoTile: false,
      snapped: false,
      mac: false,
    };
    const find = (c: LauncherContext) => actionEntries(c).find((entry) => entry.id === 'action:shortcuts');
    expect(find(context)?.keys).toEqual(['?']);
    expect(find({ ...context, compact: true })).toBeUndefined();
  });

  it('draws the undo key in the search box per platform', () => {
    const context: LauncherContext = {
      frames: 0,
      hasFocused: false,
      compact: false,
      undoLabel: 'Tidy up',
      theme: 'dark',
      fullscreen: 'off',
      autoTile: false,
      snapped: false,
      mac: false,
    };
    const undo = (mac: boolean) => actionEntries({ ...context, mac }).find((e) => e.id === 'action:undo');
    expect(undo(false)?.keys).toEqual(['Ctrl', 'Z']);
    expect(undo(true)?.keys).toEqual(['⌘', 'Z']);
  });
});
