/**
 * Preferences only — theme, wallpaper choice, window layout, studio and
 * payment defaults. Documents never go in localStorage; they live in
 * IndexedDB via the repository.
 *
 * The artist's own wallpapers are the one apparent exception but not a real
 * one: localStorage holds only the small records that point at them, and the
 * images themselves are blobs in IndexedDB like every other image in the app.
 */

import type { DesktopLayout, IconPosition } from '../os/desktopLayout';
import type { WindowState } from '../os/windows';
import type { TileLayout } from '../os/tiling';
import type { Trash } from '../os/trash';
import type { GuestEntry } from '../connect/guestbook';
import type { CustomWallpaper, WallpaperFit } from './wallpapers';
import type { Slideshow } from './slideshow';

export type Theme = 'light' | 'dark';

/**
 * The wallpapers that ship with the app. `custom` is one of the artist's own;
 * `slideshow` is several of them, one after another.
 */
export type WallpaperId =
  | 'obsidian'
  | 'graphite'
  | 'slate'
  | 'indigo'
  | 'dusk'
  | 'plaster'
  | 'sandstone'
  | 'linen'
  | 'gesso'
  | 'mist'
  | 'solid'
  | 'custom'
  | 'photograph'
  | 'slideshow';

export interface BundledWallpaper {
  id: Exclude<WallpaperId, 'custom' | 'solid' | 'slideshow' | 'photograph'>;
  name: string;
  /** Path under public/, so the service worker can precache it. */
  src: string;
  /** Which theme it was drawn for. Both still work in either theme. */
  suits: Theme;
}

/**
 * Ten pictures that ship with the app, ordered dark to light so the picker
 * reads as a range rather than a jumble. All drawn as SVG — a few kilobytes
 * each, sharp at any resolution, and cached for offline.
 */
export const BUNDLED_WALLPAPERS: BundledWallpaper[] = [
  { id: 'obsidian', name: 'Obsidian', src: '/wallpapers/obsidian.svg', suits: 'dark' },
  { id: 'graphite', name: 'Graphite', src: '/wallpapers/graphite.svg', suits: 'dark' },
  { id: 'slate', name: 'Slate', src: '/wallpapers/slate.svg', suits: 'dark' },
  { id: 'indigo', name: 'Indigo', src: '/wallpapers/indigo.svg', suits: 'dark' },
  { id: 'dusk', name: 'Dusk', src: '/wallpapers/dusk.svg', suits: 'dark' },
  { id: 'plaster', name: 'Studio Plaster', src: '/wallpapers/plaster.svg', suits: 'dark' },
  { id: 'sandstone', name: 'Sandstone', src: '/wallpapers/sandstone.svg', suits: 'dark' },
  { id: 'linen', name: 'Linen', src: '/wallpapers/linen.svg', suits: 'light' },
  { id: 'gesso', name: 'Gesso', src: '/wallpapers/gesso.svg', suits: 'light' },
  { id: 'mist', name: 'Mist', src: '/wallpapers/mist.svg', suits: 'light' },
];

export interface WallpaperChoice {
  id: WallpaperId;
  /**
   * Which of the artist's own pictures is on the desktop. Only meaningful
   * when id is 'custom', and it names a record in the wallpaper library.
   */
  customImageId: string | null;
  /**
   * Which shipped photograph is on the desktop, as its path under public/.
   * Only meaningful when id is 'photograph'.
   */
  photographSrc?: string | null;
  /** How the picture is fitted. Ignored by the bundled ones, which all tile. */
  fit?: WallpaperFit;
  /**
   * How much to darken the picture, 0–70%. A bright holiday photo makes white
   * icon labels unreadable; this is the dial that fixes it without the artist
   * having to edit the picture.
   */
  dim?: number;
  /**
   * Shows the desktop picture in black and white. The picture itself is not
   * changed — this is a filter over the background only, so the windows, the
   * icons and the dock keep their colour.
   */
  monochrome?: boolean;
  /**
   * The pictures the desktop cycles through, and how long each is up. Kept
   * even while another wallpaper is chosen, so turning the slideshow back on
   * does not mean picking them all again.
   */
  slideshow?: Slideshow;
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
  wallpaperLibrary: 'artistOS.wallpaperLibrary',
  desktopLayout: 'artistOS.desktopLayout',
  trash: 'artistOS.trash',
  trashPosition: 'artistOS.trashPosition',
  guests: 'artistOS.guestBook',
  siteUrl: 'artistOS.siteUrl',
  askForSignature: 'artistOS.askForSignature',
  mileageRate: 'artistOS.mileageRate',
  windows: 'artistOS.windows',
  restoreWindows: 'artistOS.restoreWindows',
  autoTile: 'artistOS.autoTile',
  tileLayout: 'artistOS.tileLayout',
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
    id: loadTheme() === 'light' ? 'linen' : 'obsidian',
    customImageId: null,
  });
export const saveWallpaper = (value: WallpaperChoice): void => write(KEYS.wallpaper, value);

/**
 * The artist's own pictures. Only the records live here — each one points at
 * a blob in IndexedDB, which is where the actual image is.
 */
/**
 * Whether the guest book asks for a signature. On by default: a signature is
 * the thing that makes a guest book a guest book. Some shows are not the
 * place for one — a table with a queue, a tablet passed round in the rain —
 * so it can be switched off, and then the book simply does not ask.
 */
export const loadAskForSignature = (): boolean => read<boolean>(KEYS.askForSignature, true);
export const saveAskForSignature = (value: boolean): void => write(KEYS.askForSignature, value);

/**
 * The windows that were open, so a reload picks the work back up where it was
 * left rather than on an empty desktop. Only the arrangement is kept — what
 * is *in* a window is read from the records, so a window whose subject has
 * since been deleted is dropped on the way in rather than opening empty.
 */
export const loadWindows = (): WindowState[] => {
  const stored = read<WindowState[]>(KEYS.windows, []);
  return Array.isArray(stored) ? stored : [];
};
export const saveWindows = (value: WindowState[]): void => write(KEYS.windows, value);

/** Whether to put them back at all. Some people want an empty desk. */
export const loadRestoreWindows = (): boolean => read<boolean>(KEYS.restoreWindows, true);
export const saveRestoreWindows = (value: boolean): void => write(KEYS.restoreWindows, value);

/**
 * Auto-tiling: windows arrange themselves whenever one opens or closes. Off
 * by default — windows that move on their own are a surprise until asked for.
 */
export const loadAutoTile = (): boolean => read<boolean>(KEYS.autoTile, false) === true;
export const saveAutoTile = (value: boolean): void => write(KEYS.autoTile, value);

const TILE_LAYOUTS: TileLayout[] = ['columns', 'rows', 'grid', 'main'];

/** The layout last asked for, which auto-tiling and a resized screen reuse. */
export const loadTileLayout = (): TileLayout => {
  const stored = read<string>(KEYS.tileLayout, 'columns');
  return TILE_LAYOUTS.includes(stored as TileLayout) ? (stored as TileLayout) : 'columns';
};
export const saveTileLayout = (value: TileLayout): void => write(KEYS.tileLayout, value);

/**
 * What a mile is worth, in minor units, as the artist has set it.
 *
 * Null by default and no number ships with the app: the rate changes every
 * year, is different in every country, and one baked into a build would be
 * wrong within months and wrong on somebody's tax return. Until it is set, a
 * mileage row records the miles and says it has no figure.
 */
export const loadMileageRate = (): number | null => read<number | null>(KEYS.mileageRate, null);
export const saveMileageRate = (value: number | null): void => write(KEYS.mileageRate, value);

export const loadWallpaperLibrary = (): CustomWallpaper[] =>
  read<CustomWallpaper[]>(KEYS.wallpaperLibrary, []);
export const saveWallpaperLibrary = (value: CustomWallpaper[]): void =>
  write(KEYS.wallpaperLibrary, value);

export const loadLayout = (): WindowLayout =>
  // Opens to the right of the desktop icons rather than on top of them, so a
  // first launch shows both the work and the workspace around it.
  read<WindowLayout>(KEYS.layout, { x: 208, y: 54, maximized: false, locked: false });
export const saveLayout = (value: WindowLayout): void => write(KEYS.layout, value);

/**
 * Where the artist has dragged each desktop icon. Positions only — the icons
 * themselves are whatever is in the studio, so a position for something that
 * has since been deleted is simply ignored when it is read back.
 */
export const loadDesktopLayout = (): DesktopLayout => read<DesktopLayout>(KEYS.desktopLayout, {});
export const saveDesktopLayout = (value: DesktopLayout): void =>
  write(KEYS.desktopLayout, value);

/**
 * What is in the Trash. Only the list of what is hidden lives here — the
 * records themselves stay in IndexedDB untouched, which is what makes putting
 * something back a matter of forgetting a line rather than restoring data.
 */
export const loadTrash = (): Trash => read<Trash>(KEYS.trash, []);
export const saveTrash = (value: Trash): void => write(KEYS.trash, value);

/**
 * Where the artist dragged the can. Null means they never did, and it sits
 * wherever the layout puts it by default.
 */
export const loadTrashPosition = (): IconPosition | null =>
  read<IconPosition | null>(KEYS.trashPosition, null);
export const saveTrashPosition = (value: IconPosition | null): void =>
  write(KEYS.trashPosition, value);

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


/**
 * The guest book. Small text records, kept on this device — see
 * src/connect/contact.ts for why they cannot yet leave it.
 */
export const loadGuests = (): GuestEntry[] => read<GuestEntry[]>(KEYS.guests, []);

/**
 * Since database version 7 the guest book lives in IndexedDB. The old copy is
 * moved to a backup key once every entry is safely in the database — kept,
 * not deleted, because an entry lost in a move cannot be asked for again.
 */
export const retireLocalGuests = (): void => {
  try {
    const old = localStorage.getItem(KEYS.guests);
    if (old === null) return;
    localStorage.setItem(`${KEYS.guests}.movedToDatabase`, old);
    localStorage.removeItem(KEYS.guests);
  } catch {
    /* the next load tries again; the database copy is already whole */
  }
};

/** The artist's own web address, for the QR code and the contact card. */
export const loadSiteUrl = (): string => read<string>(KEYS.siteUrl, '');
export const saveSiteUrl = (value: string): void => write(KEYS.siteUrl, value);
