/**
 * Preferences only — theme, background choice, window layout. Documents never
 * go in localStorage; they live in IndexedDB via the repository.
 */

export type Theme = 'light' | 'dark';
export type Background = 'wallpaper' | 'solid';

export interface WindowLayout {
  x: number;
  y: number;
  maximized: boolean;
  locked: boolean;
}

const KEYS = {
  theme: 'artistOS.theme',
  background: 'artistOS.background',
  layout: 'artistOS.windowLayout',
  studio: 'artistOS.studioDefaults',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A browser with site data blocked still runs; it just forgets preferences.
  }
}

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(KEYS.theme);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* fall through to the system preference */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEYS.theme, theme);
  } catch {
    /* preferences are a convenience, not a requirement */
  }
  document.documentElement.dataset.theme = theme;
}

export const loadBackground = (): Background => read<Background>(KEYS.background, 'wallpaper');
export const saveBackground = (value: Background): void => write(KEYS.background, value);

export const loadLayout = (): WindowLayout =>
  read<WindowLayout>(KEYS.layout, { x: 96, y: 72, maximized: false, locked: false });
export const saveLayout = (value: WindowLayout): void => write(KEYS.layout, value);

export interface StudioDefaults {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export const loadStudioDefaults = (): StudioDefaults =>
  read<StudioDefaults>(KEYS.studio, { name: '', email: null, phone: null, address: null });
export const saveStudioDefaults = (value: StudioDefaults): void => write(KEYS.studio, value);
