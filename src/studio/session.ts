/**
 * Whether this browser is signed in to the studio, read without loading the
 * assistant. Only a hint for what to draw first: the session itself is an
 * HttpOnly cookie set by studio-api on this origin (Art-Talk-Back D-078),
 * valid 30 days and renewed on use, so a device in use stays signed in.
 * Signed out, nothing calls /v1 or /assistant and the app is offline as ever.
 */
export const STUDIO_KEY = 'artistOS.studio';

export interface StudioSession {
  email: string;
}

export function readStudioSession(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): StudioSession | null {
  try {
    const value = JSON.parse(storage?.getItem(STUDIO_KEY) ?? 'null') as unknown;
    return value && typeof (value as StudioSession).email === 'string' ? { email: (value as StudioSession).email } : null;
  } catch {
    return null;
  }
}

export function writeStudioSession(
  value: StudioSession | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage,
): void {
  try {
    if (value) storage?.setItem(STUDIO_KEY, JSON.stringify(value));
    else storage?.removeItem(STUDIO_KEY);
  } catch {
    // Private mode: the cookie still works; only the hint is lost.
  }
}
