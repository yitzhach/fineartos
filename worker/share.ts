import {
  MAX_PICTURE_BYTES,
  PICTURE_TYPES,
  expiresAt,
  isExpired,
  isPicture,
  isShareId,
  newShareId,
  readCardInput,
  renderGonePage,
  renderSharePage,
  type ShareCard,
} from '../src/share/viewLink';

/**
 * Viewing links on this origin. The studio (signed in through studio-api's
 * cookie) uploads a picture; anyone holding the link sees a read-only page.
 *
 *   GET    /share/status          { available }  — the app hides the button without it
 *   POST   /share/pictures        multipart: picture, title, details → { id, url, expiresAt }
 *   GET    /share/pictures        the signed-in studio's own links, newest first
 *   DELETE /share/pictures/:id    the studio that made it removes it
 *   GET    /p/:id                 the client's page (or a plain "no longer available")
 *   GET    /p/:id/picture         the picture itself
 *
 * The bucket is private: nothing in it is reachable except through here, and
 * an expired link answers exactly like one that never existed.
 */

interface Fetcher {
  fetch(r: Request): Promise<Response>;
}
interface StoredObject {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  text(): Promise<string>;
}
export interface ShareBucket {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, value: ArrayBuffer | string, options?: unknown): Promise<unknown>;
  delete(keys: string | string[]): Promise<unknown>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}
export interface ShareEnv {
  API?: Fetcher;
  SHARES?: ShareBucket;
}
export interface ShareClock {
  now(): Date;
  randomBytes(n: number): Uint8Array;
}

const realClock: ShareClock = {
  now: () => new Date(),
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
};

const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
const problem = (status: number, message: string) => json({ error: { message } }, status);
const html = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

const pictureKey = (id: string) => `shares/${id}/picture`;
const cardKey = (id: string) => `shares/${id}/card.json`;
/** One empty marker per link under its owner, so a studio can list its own. */
const ownerPrefix = (owner: string) => `owners/${encodeURIComponent(owner)}/`;

export function isSharePath(pathname: string): boolean {
  return pathname.startsWith('/share/') || pathname.startsWith('/p/');
}

/** Who is signed in, asked of studio-api with the caller's own cookie. Null when nobody. */
async function studioOwner(request: Request, api: Fetcher): Promise<string | null> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  try {
    const res = await api.fetch(new Request(new URL('/v1/me', request.url), { headers: { Cookie: cookie } }));
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { user?: { id?: unknown; email?: unknown } }; user?: { id?: unknown; email?: unknown } };
    const user = body?.data?.user ?? body?.user;
    const who = user?.id ?? user?.email;
    return typeof who === 'string' && who ? who : null;
  } catch {
    return null;
  }
}

async function readCard(bucket: ShareBucket, id: string): Promise<ShareCard | null> {
  const stored = await bucket.get(cardKey(id));
  if (!stored) return null;
  try {
    return JSON.parse(await stored.text()) as ShareCard;
  } catch {
    return null;
  }
}

export async function handleShare(request: Request, env: ShareEnv, clock: ShareClock = realClock): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const bucket = env.SHARES;

  if (path === '/share/status') return json({ available: Boolean(bucket && env.API) });

  // --- The client's side: read-only, no sign-in. ---
  const view = path.match(/^\/p\/([^/]+)(\/picture)?\/?$/);
  if (view) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return problem(405, 'Method not allowed.');
    const [, id = '', picture] = view;
    if (!bucket || !isShareId(id)) return picture ? new Response(null, { status: 404 }) : html(renderGonePage(), 404);
    const card = await readCard(bucket, id);
    if (!card || isExpired(card, clock.now())) return picture ? new Response(null, { status: 404 }) : html(renderGonePage(), 404);
    if (!picture) return html(renderSharePage(card, id), 200);
    const stored = await bucket.get(pictureKey(id));
    if (!stored) return new Response(null, { status: 404 });
    return new Response(stored.body, {
      headers: {
        'Content-Type': card.type,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  }

  // --- The studio's side: signed in, same origin. ---
  if (!bucket || !env.API) return problem(503, 'Viewing links aren’t switched on for this copy of Artist OS.');
  const item = path.match(/^\/share\/pictures(?:\/([^/]+))?\/?$/);
  if (!item) return problem(404, 'Not found.');
  const [, id] = item;

  const owner = await studioOwner(request, env.API);
  if (!owner) return problem(401, 'Sign in to your studio to make a viewing link.');

  if (request.method === 'POST' && !id) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return problem(400, 'The upload could not be read.');
    }
    const card = readCardInput(form.get('title'), form.get('details'));
    if (!card) return problem(400, 'The picture needs a title, and the details must be under 4,000 characters.');
    const picture = form.get('picture');
    if (!picture || typeof picture === 'string') return problem(400, 'No picture came with the upload.');
    const type = picture.type;
    if (!(PICTURE_TYPES as readonly string[]).includes(type)) return problem(415, 'Only JPEG, PNG or WebP pictures can be shared.');
    if (picture.size > MAX_PICTURE_BYTES) return problem(413, 'The picture is over 8 MB.');
    const bytes = await picture.arrayBuffer();
    if (!isPicture(type, new Uint8Array(bytes))) return problem(400, 'That file isn’t the picture it claims to be.');

    const newId = newShareId(clock.randomBytes);
    const now = clock.now();
    const stored: ShareCard = { ...card, type, owner, createdAt: now.toISOString(), expiresAt: expiresAt(now) };
    try {
      await bucket.put(pictureKey(newId), bytes, { httpMetadata: { contentType: type } });
      await bucket.put(cardKey(newId), JSON.stringify(stored), { httpMetadata: { contentType: 'application/json' } });
      await bucket.put(ownerPrefix(owner) + newId, '');
    } catch {
      return problem(502, 'The picture could not be stored just now. Nothing was shared.');
    }
    return json({ data: { id: newId, url: new URL(`/p/${newId}`, request.url).href, expiresAt: stored.expiresAt } }, 201);
  }

  if (request.method === 'GET' && !id) {
    const prefix = ownerPrefix(owner);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix, cursor });
      for (const object of page.objects) ids.push(object.key.slice(prefix.length));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    const now = clock.now();
    const links = [];
    for (const linkId of ids) {
      const card = isShareId(linkId) ? await readCard(bucket, linkId) : null;
      if (!card) continue;
      links.push({
        id: linkId,
        url: new URL(`/p/${linkId}`, request.url).href,
        title: card.title,
        createdAt: card.createdAt,
        expiresAt: card.expiresAt,
        expired: isExpired(card, now),
      });
    }
    links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ data: links });
  }

  if (request.method === 'DELETE' && id) {
    if (!isShareId(id)) return problem(404, 'That link doesn’t exist.');
    const card = await readCard(bucket, id);
    if (!card) return problem(404, 'That link doesn’t exist, or was already removed.');
    if (card.owner !== owner) return problem(403, 'Only the studio that made this link can remove it.');
    try {
      await bucket.delete([pictureKey(id), cardKey(id), ownerPrefix(owner) + id]);
    } catch {
      return problem(502, 'The link could not be removed just now. It still works.');
    }
    return json({ data: { removed: id } });
  }

  return problem(405, 'Method not allowed.');
}
