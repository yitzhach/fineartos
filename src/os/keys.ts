/**
 * Key names, the way each platform draws them. A Mac, an iPhone or an iPad
 * says ⌘, ⌥ and ⇧; everything else says Ctrl, Alt and Shift. Every message
 * and hint that names a key goes through here, so nobody on Windows is told
 * to press a key their keyboard does not have.
 */

/** ⌘ and ⌥ on a Mac or an iPad; Ctrl and Alt everywhere else. */
export function isApplePlatform(userAgent: string): boolean {
  return /Mac|iPhone|iPad|iPod/.test(userAgent);
}

export interface KeyNames {
  mac: boolean;
  /** ⌘ or Ctrl: the key the app's shortcuts are held with. */
  mod: string;
  alt: string;
  shift: string;
  /** The key that removes a thing: a Mac's is marked delete and sends Backspace. */
  remove: string;
}

export function keyNames(mac: boolean): KeyNames {
  return mac
    ? { mac, mod: '⌘', alt: '⌥', shift: '⇧', remove: '⌫' }
    : { mac, mod: 'Ctrl', alt: 'Alt', shift: 'Shift', remove: 'Delete' };
}

/** A chord as one piece of text: ⌘Z on a Mac, Ctrl+Z everywhere else. */
export function keyText(keys: readonly string[], mac: boolean): string {
  return keys.join(mac ? '' : '+');
}

/** The undo chord, for messages that say how to take something back. */
export function undoKeys(mac: boolean): string {
  return keyText([keyNames(mac).mod, 'Z'], mac);
}
