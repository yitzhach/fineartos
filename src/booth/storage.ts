/**
 * Booth settings are preferences, so they live in localStorage. Whether booth
 * mode is on is stored too: a visitor who reloads the page must land back in
 * the booth, not in the studio. Kept tiny — the shell imports this file.
 */

const SETTINGS_KEY = 'artistOS.booth';
const ON_KEY = 'artistOS.booth.on';

export function boothIsOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

/** Returns a problem to show, or null. Failing to store "on" is not silent (rule 5). */
export function setBoothOn(on: boolean): string | null {
  try {
    if (on) localStorage.setItem(ON_KEY, '1');
    else localStorage.removeItem(ON_KEY);
    return null;
  } catch {
    return on
      ? 'Booth mode is on, but this browser would not remember it — a reload would open the studio.'
      : 'Booth mode is off, but this browser would not remember it.';
  }
}

export function readBoothRaw(): unknown {
  try {
    const text = localStorage.getItem(SETTINGS_KEY);
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeBoothRaw(value: unknown): string | null {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
    return null;
  } catch {
    return 'The booth settings could not be saved in this browser.';
  }
}
