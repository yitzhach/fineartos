/**
 * Booth mode: the tablet handed to the public at a show.
 *
 * Everything here is a rule, not a picture: which panels a visitor can reach,
 * which pieces they see and what each price line says, when the attract loop
 * comes back, and whether a PIN lets the artist out. The screen only draws it.
 *
 * Honest limits, said where the artist sets the PIN: a PIN on a web page keeps
 * a passer-by out of the studio's money and clients. It is not a lock — the
 * browser itself can still be closed, and a four-digit PIN can be guessed.
 */

import { describePrice, isShownToVisitors, statusOf, type Photo } from '../photo/photo';

export type BoothPanel = 'guestbook' | 'pieces' | 'statement' | 'website' | 'qr';

export interface BoothSettings {
  /** Salted SHA-256 of the PIN, hex. Null = no PIN set, so booth mode cannot start. */
  pinHash: string | null;
  pinSalt: string | null;
  statement: string;
  /**
   * The artist has looked and seen their site inside the app. A browser
   * cannot tell a page that a site refuses to be framed, so this is asked,
   * never guessed. False = the website panel is the QR code instead (rule 8).
   */
  siteShowsInside: boolean;
  /** Seconds without a touch before the loop comes back. */
  idleSeconds: number;
  /** Seconds each piece stays up in the attract loop. */
  slideSeconds: number;
}

export const MIN_IDLE_SECONDS = 20;
export const MAX_IDLE_SECONDS = 600;
export const DEFAULT_IDLE_SECONDS = 60;
export const MIN_SLIDE_SECONDS = 3;
export const MAX_SLIDE_SECONDS = 60;
export const DEFAULT_SLIDE_SECONDS = 7;

export function defaultBooth(): BoothSettings {
  return {
    pinHash: null,
    pinSalt: null,
    statement: '',
    siteShowsInside: false,
    idleSeconds: DEFAULT_IDLE_SECONDS,
    slideSeconds: DEFAULT_SLIDE_SECONDS,
  };
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/** Reads stored settings, keeping whatever is sound and defaulting the rest. */
export function parseBooth(raw: unknown): BoothSettings {
  const base = defaultBooth();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const hash = typeof r.pinHash === 'string' && typeof r.pinSalt === 'string';
  return {
    pinHash: hash ? (r.pinHash as string) : null,
    pinSalt: hash ? (r.pinSalt as string) : null,
    statement: typeof r.statement === 'string' ? r.statement : '',
    siteShowsInside: r.siteShowsInside === true,
    idleSeconds: clamp(r.idleSeconds, MIN_IDLE_SECONDS, MAX_IDLE_SECONDS, DEFAULT_IDLE_SECONDS),
    slideSeconds: clamp(r.slideSeconds, MIN_SLIDE_SECONDS, MAX_SLIDE_SECONDS, DEFAULT_SLIDE_SECONDS),
  };
}

/** What is wrong with a PIN the artist is choosing, or null when it will do. */
export function pinProblem(pin: string, again: string): string | null {
  if (!/^\d+$/.test(pin)) return 'A PIN is digits only.';
  if (pin.length < 4) return 'Use at least four digits.';
  if (pin.length > 12) return 'Twelve digits at most.';
  if (/^(\d)\1+$/.test(pin)) return 'Not one digit repeated — that is the first thing anyone tries.';
  if (pin !== again) return 'The two PINs do not match.';
  return null;
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return hex(await crypto.subtle.digest('SHA-256', data));
}

export async function withPin(settings: BoothSettings, pin: string, salt = newSalt()): Promise<BoothSettings> {
  return { ...settings, pinSalt: salt, pinHash: await hashPin(pin, salt) };
}

export async function pinMatches(settings: BoothSettings, pin: string): Promise<boolean> {
  if (!settings.pinHash || !settings.pinSalt) return false;
  return (await hashPin(pin, settings.pinSalt)) === settings.pinHash;
}

/**
 * Wrong PINs slow down after a few, so a visitor tapping at random cannot
 * walk through every four-digit code in an afternoon.
 */
export function lockoutSeconds(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(300, 5 * 2 ** (failures - 3));
}

/** Why booth mode cannot start yet, or null when it can. */
export function startProblem(settings: BoothSettings): string | null {
  if (!settings.pinHash) return 'Set a PIN first — it is the only way back out of booth mode.';
  return null;
}

/**
 * The panels a visitor can reach, in the order the tabs show them. The
 * statement appears only once written. The website appears only when the
 * artist saw it shown inside; otherwise a site given becomes its QR code.
 */
export function boothPanels(settings: BoothSettings, siteUrl: string | null): BoothPanel[] {
  const panels: BoothPanel[] = ['guestbook', 'pieces'];
  if (settings.statement.trim()) panels.push('statement');
  if (siteUrl && settings.siteShowsInside) panels.push('website');
  panels.push('qr');
  return panels;
}

export const PANEL_LABELS: Record<BoothPanel, string> = {
  guestbook: 'Sign the book',
  pieces: 'The work',
  statement: 'About the artist',
  website: 'Website',
  qr: 'Take my details',
};

/**
 * The pieces at this show: those the Shows tool took there, plus those marked
 * as hanging now, never the ones the artist hid from visitors. Artist's order.
 */
export function boothPieces(photos: Photo[], showPieceIds: string[]): Photo[] {
  const taken = new Set(showPieceIds);
  return photos.filter((photo) => (taken.has(photo.id) || photo.inCurrentShow) && isShownToVisitors(photo));
}

/** The line a visitor reads under a piece. Unknown stays unknown (rule 1). */
export function boothPriceLine(photo: Photo): string {
  const status = statusOf(photo);
  if (status === 'sold') return 'Sold';
  if (status === 'nfs') return 'Not for sale';
  return describePrice(photo);
}

/** Loop or panels: idle long enough and the loop comes back. */
export function isIdle(lastTouchMs: number, nowMs: number, idleSeconds: number): boolean {
  return nowMs - lastTouchMs >= idleSeconds * 1000;
}

/** Which slide is up at a moment, given when the loop started. */
export function slideAt(count: number, startedMs: number, nowMs: number, slideSeconds: number): number {
  if (count <= 0) return -1;
  const elapsed = Math.max(0, nowMs - startedMs);
  return Math.floor(elapsed / (slideSeconds * 1000)) % count;
}
