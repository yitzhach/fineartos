/**
 * The shortcut sheet: every key the app answers to, and nothing it does not.
 * A key listed here that did nothing would be a dead control, so each row is
 * written against the handler that makes it work — App's shell keys, undo.ts,
 * the search box, the desktop icons and the picture preview.
 */
import { keyNames, keyText } from './keys';
import { goSequences } from './launcher';

export interface Shortcut {
  /** One or more ways to do it; each is a chord, drawn key by key. */
  keys: string[][];
  what: string;
}

export interface ShortcutGroup {
  title: string;
  /** When the keys work, where that is not everywhere. */
  note?: string;
  shortcuts: Shortcut[];
}

/**
 * Said once, above the groups. A key typed into a field is the field's — its
 * own undo included — except the search box chord and the tab keys, which
 * are deliberate enough to mean the shell wherever the cursor is.
 */
export function typingNote(mac: boolean): string {
  return `While you type in a field, the keys are the field's — except ${keyText([keyNames(mac).mod, 'K'], mac)} and the tab keys.`;
}

export function shortcutGroups(context: { mac: boolean; compact: boolean }): ShortcutGroup[] {
  const { mod, alt, shift, remove } = keyNames(context.mac);
  const groups: ShortcutGroup[] = [
    {
      title: 'Anywhere',
      shortcuts: [
        { keys: [[mod, 'K']], what: 'Open the search box' },
        { keys: [['/']], what: 'Open the search box' },
        { keys: [[mod, 'Z']], what: 'Undo the last move, filing or trip to the Trash' },
        { keys: [['?']], what: 'This list' },
      ],
    },
    {
      title: 'Go to a tool',
      note: 'G, then a letter.',
      shortcuts: goSequences().map((go) => ({
        keys: [['G', go.letter]],
        what: go.tool === 'home' ? 'Home — show the desktop' : go.title,
      })),
    },
    {
      title: 'Windows',
      shortcuts: [
        { keys: [[mod, alt, '←'], [mod, alt, '→']], what: 'Step through the tabs of the window in front' },
        { keys: [[alt, '1–9']], what: 'Jump to a tab' },
      ],
    },
    {
      title: 'In the search box',
      shortcuts: [
        { keys: [['↑'], ['↓']], what: 'Move through the results' },
        { keys: [['Enter']], what: 'Open the one picked' },
        { keys: [['Esc']], what: 'Close it' },
      ],
    },
    {
      title: 'On the desktop',
      note: 'With an icon selected.',
      shortcuts: [
        { keys: [['Enter'], ['Space']], what: 'Open it' },
        {
          keys: context.mac ? [[remove]] : [[remove], ['Backspace']],
          what: 'Move it to the Trash — nothing is deleted',
        },
      ],
    },
    {
      title: 'Looking at a picture',
      shortcuts: [
        { keys: [['←'], ['→']], what: 'The previous or the next picture' },
        { keys: [['Home'], ['End']], what: 'The first or the last' },
        { keys: [['F']], what: 'Fullscreen' },
        { keys: [['Esc'], ['X']], what: 'Close the preview' },
      ],
    },
  ];

  // Snapping means nothing on a phone, where every window is a sheet.
  if (!context.compact) {
    groups[2]!.shortcuts.push(
      { keys: [[alt, shift, '←'], [alt, shift, '→']], what: 'Snap the window in front to the left or right half' },
      { keys: [[alt, shift, '↑']], what: 'Fill the screen — from a half, its top quarter' },
      { keys: [[alt, shift, '↓']], what: 'Put it back — from a half, its bottom quarter' },
    );
  }
  return groups;
}
