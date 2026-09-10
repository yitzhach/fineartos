/**
 * Preferences only — theme, wallpaper choice, window layout, studio and
 * payment defaults. Documents never go in localStorage; they live in
 * IndexedDB via the repository.
 *
 * The artist's own wallpaper is the one apparent exception but not a real
 * one: localStorage holds only the *id* of the image, and the image itself is
 * a blob in IndexedDB like every other image in the app.
 */

export type Theme = 'light' | 'dark';

/** The wallpapers that ship with the app. `custom` means the artist's own. */
export type WallpaperId = 'plaster' | 'dusk' | 'linen' | 'solid' | 'custom';

export interface BundledWallpaper {
  id: Exclude<WallpaperId, 'custom' | 'solid'>;
  name: string;
  /** Path under public/, so the service worker can precache it. */
  src: string;
  /** Which theme it was drawn for. Both still work in either theme. */
  suits: Theme;
}

export const BUNDLED_WALLPAPERS: BundledWallpaper[] = [
  { id: 'plaster', name: 'Studio Plaster', src: '/wallpapers/plaster.svg', suits: 'dark' },
  { id: 'dusk', name: 'Dusk', src: '/wallpapers/dusk.svg', suits: 'dark' },
  { id: 'linen', name: 'Linen', src: '/wallpapers/linen.svg', suits: 'light' },
];

export interface WallpaperChoice {
  id: WallpaperId;
  /** Image id in the IndexedDB image store. Only meaningful when id is 'custom'. */
  customImageId: string | null;
}

export interface WindowLayout {
  x: number;
  y: number;
  maximized: boolean;
  locked: boolean;
}

/**
 * How the artist wants to be paid. Every field is free text the artist sets
 * once, and every one is null until they do — the invoice prints only what is
 * actually filled in. Nothing here processes a payment or talks to a payment
 * provider; a Square link is a link the artist pasted in, no more.
 */
export interface PaymentInstructions {
  squareLink: string | null;
  paypal: string | null;
  venmo: string | null;
  zelle: string | null;
  checkPayableTo: string | null;
  bankDetails: string | null;
  /** Free text printed under the rest, e.g. "Net 30. Late fee 1.5%/month." */
  terms: string | null;
}

export function emptyPaymentInstructions(): PaymentInstructions {
  return {
    squareLink: null,
    paypal: null,
    venmo: null,
    zelle: null,
    checkPayableTo: null,
    bankDetails: null,
    terms: null,
  };
}

/** True when the artist has filled in at least one way to be paid. */
export function hasAnyPaymentMethod(p: PaymentInstructions): boolean {
  return [p.squareLink, p.paypal, p.venmo, p.zelle, p.checkPayableTo, p.bankDetails].some(
    (v) => v !== null && v.trim() !== '',
  );
}

const KEYS = {
  theme: 'artistOS.theme',
  wallpaper: 'artistOS.wallpaper',
  layout: 'artistOS.windowLayout',
  studio: 'artistOS.studioDefaults',
  payment: 'artistOS.paymentInstructions',
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

/**
 * On a first run the wallpaper follows the theme: a dark plaster wall under a
 * dark interface, primed linen under a light one. Pairing a dark wallpaper
 * with a light system bar looks like a bug, not a choice.
 */
export const loadWallpaper = (): WallpaperChoice =>
  read<WallpaperChoice>(KEYS.wallpaper, {
    id: loadTheme() === 'light' ? 'linen' : 'plaster',
    customImageId: null,
  });
export const saveWallpaper = (value: WallpaperChoice): void => write(KEYS.wallpaper, value);

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

export const loadPaymentInstructions = (): PaymentInstructions => {
  // Merged over a fresh empty set, so a preference saved by an older build
  // that lacked a field reads back as null rather than undefined.
  const stored = read<Partial<PaymentInstructions>>(KEYS.payment, {});
  return { ...emptyPaymentInstructions(), ...stored };
};
export const savePaymentInstructions = (value: PaymentInstructions): void => write(KEYS.payment, value);
