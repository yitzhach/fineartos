/**
 * Viewing links: the studio uploads one picture and its details, and the
 * client gets a private link to a read-only page instead of an attachment a
 * mailto: link cannot carry. Rules, the client's page and the message wording
 * live here, DOM-free, so the Worker and the app share one tested copy.
 *
 * Honest by construction: the page says who shared it and when it stops
 * working, an expired or removed link says so plainly, and nothing here sends
 * anything — the link still goes out through the artist's own mail app.
 */

/** How long a link works. Long enough for a slow decision, short enough to tidy itself. */
export const SHARE_DAYS = 90;
export const MAX_PICTURE_BYTES = 8 * 1024 * 1024;
export const MAX_TITLE = 200;
export const MAX_DETAILS = 4000;
export const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** What the Worker stores beside the picture. `owner` never reaches the client page. */
export interface ShareCard {
  title: string;
  details: string;
  type: string;
  owner: string;
  createdAt: string;
  expiresAt: string;
}

/** One of the studio's own links, as the list shows it. */
export interface ShareListed {
  id: string;
  url: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface ShareCreated {
  id: string;
  url: string;
  expiresAt: string;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** 128 random bits, base64url: unguessable, and short enough to sit in a text. */
export function newShareId(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(16);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isShareId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/** Title and details as the studio typed them, trimmed and capped; null when unusable. */
export function readCardInput(title: unknown, details: unknown): { title: string; details: string } | null {
  if (typeof title !== 'string' || typeof details !== 'string') return null;
  const t = title.trim();
  const d = details.trim();
  if (!t || t.length > MAX_TITLE || d.length > MAX_DETAILS) return null;
  return { title: t, details: d };
}

export function expiresAt(now: Date, days = SHARE_DAYS): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function isExpired(card: Pick<ShareCard, 'expiresAt'>, now: Date): boolean {
  const end = Date.parse(card.expiresAt);
  return !Number.isFinite(end) || end <= now.getTime();
}

/** The picture's declared type, checked against its first bytes. */
export function isPicture(type: string, b: Uint8Array): boolean {
  if (type === 'image/png') return b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
  if (type === 'image/jpeg') return b[0] === 255 && b[1] === 216;
  if (type === 'image/webp')
    return b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80;
  return false;
}

/** The message with its link last, so it survives a mail app trimming the body. */
export function withViewingLink(message: string, url: string): string {
  return `${message.trimEnd()}\n\nSee the picture here: ${url}`;
}

/** "9 January 2027" — the date a link stops working, in words. */
export function linkEndDate(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'an unknown date';
  return date.toLocaleDateString(locale ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const STYLE = `
:root{--bg:#f4efe6;--ink:#2b2622;--muted:#6d645b;--card:#fffdf9;--line:#e2d9cb}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a17;--ink:#efe8dd;--muted:#a99f93;--card:#27231f;--line:#3a342e}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:880px;margin:0 auto;padding:24px 16px 48px}
h1{font:600 1.6rem/1.25 Georgia,"Times New Roman",serif;margin:0 0 16px}
figure{margin:0 0 20px}
img{display:block;max-width:100%;max-height:78vh;margin:0 auto;border-radius:6px;box-shadow:0 2px 18px rgba(0,0,0,.18)}
.details{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin:0 0 16px;font:inherit}
.foot{color:var(--muted);font-size:.875rem;margin:0}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

/** The client's page: the picture, the studio's own words, and when the link ends. */
export function renderSharePage(card: Pick<ShareCard, 'title' | 'details' | 'expiresAt'>, id: string): string {
  const details = card.details ? `<pre class="details">${escapeHtml(card.details)}</pre>` : '';
  return page(
    card.title,
    `<h1>${escapeHtml(card.title)}</h1><figure><img src="/p/${encodeURIComponent(id)}/picture" alt="${escapeHtml(card.title)}"></figure>${details}<p class="foot">Shared with you privately. This link stops working on ${escapeHtml(linkEndDate(card.expiresAt))}.</p>`,
  );
}

/** Expired, removed or mistyped: the same plain answer, which reveals nothing. */
export function renderGonePage(): string {
  return page(
    'Link no longer available',
    `<h1>This link is no longer available</h1><p>It may have expired or been removed by the artist. Ask them to send it again.</p>`,
  );
}

/** The size a picture is re-drawn at before upload: never enlarged, longest edge capped. */
export function fitWithin(width: number, height: number, longest = 2400): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
