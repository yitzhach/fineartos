import { describe, expect, it } from 'vitest';
import { handleShare, type ShareBucket, type ShareClock } from '../share';

const JPEG = new Uint8Array([255, 216, 255, 224, 0, 16]);

function memoryBucket() {
  const items = new Map<string, { value: string | ArrayBuffer; type?: string }>();
  const bucket: ShareBucket = {
    async get(key) {
      const item = items.get(key);
      if (!item) return null;
      const bytes = typeof item.value === 'string' ? new TextEncoder().encode(item.value) : new Uint8Array(item.value);
      return {
        body: new Blob([bytes]).stream(),
        httpMetadata: { contentType: item.type },
        text: async () => new TextDecoder().decode(bytes),
      };
    },
    async put(key, value, options) {
      items.set(key, { value, type: (options as { httpMetadata?: { contentType?: string } })?.httpMetadata?.contentType });
    },
    async list({ prefix }) {
      return { objects: [...items.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) items.delete(key);
    },
  };
  return { bucket, items };
}

const api = (who: Record<string, string>) => ({
  async fetch(request: Request) {
    const cookie = request.headers.get('Cookie') ?? '';
    const user = who[cookie];
    return user
      ? Response.json({ data: { user: { id: user, email: `${user}@x.test` } } })
      : Response.json({ error: { message: 'no' } }, { status: 401 });
  },
});

let now = new Date('2026-10-09T12:00:00Z');
const clock: ShareClock = { now: () => now, randomBytes: (n) => new Uint8Array(n).fill(7) };
const ORIGIN = 'https://art.test';

function upload(cookie: string | null, fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request(`${ORIGIN}/share/pictures`, { method: 'POST', body: form, headers: cookie ? { Cookie: cookie } : {} });
}
const picture = (bytes = JPEG, type = 'image/jpeg') => new File([bytes], 'p.jpg', { type });

describe('viewing link worker', () => {
  it('reports whether links are switched on', async () => {
    const off = await handleShare(new Request(`${ORIGIN}/share/status`), {}, clock);
    expect(await off.json()).toEqual({ available: false });
    const on = await handleShare(new Request(`${ORIGIN}/share/status`), { SHARES: memoryBucket().bucket, API: api({}) }, clock);
    expect(await on.json()).toEqual({ available: true });
  });

  it('refuses an upload from anyone not signed in', async () => {
    const { bucket, items } = memoryBucket();
    const env = { SHARES: bucket, API: api({ 'sid=a': 'artist' }) };
    for (const cookie of [null, 'sid=wrong']) {
      const res = await handleShare(upload(cookie, { title: 'Dusk', details: '', picture: picture() }), env, clock);
      expect(res.status).toBe(401);
    }
    expect(items.size).toBe(0);
  });

  it('refuses a file that is not the picture it claims to be', async () => {
    const { bucket, items } = memoryBucket();
    const env = { SHARES: bucket, API: api({ 'sid=a': 'artist' }) };
    const res = await handleShare(upload('sid=a', { title: 'Dusk', details: '', picture: picture(new Uint8Array([1, 2, 3])) }), env, clock);
    expect(res.status).toBe(400);
    const gif = await handleShare(upload('sid=a', { title: 'Dusk', details: '', picture: picture(JPEG, 'image/gif') }), env, clock);
    expect(gif.status).toBe(415);
    expect(items.size).toBe(0);
  });

  it('uploads, shows the page and picture, then expires', async () => {
    now = new Date('2026-10-09T12:00:00Z');
    const { bucket } = memoryBucket();
    const env = { SHARES: bucket, API: api({ 'sid=a': 'artist' }) };
    const res = await handleShare(upload('sid=a', { title: 'Dusk <1>', details: 'Price on request', picture: picture() }), env, clock);
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; url: string; expiresAt: string } };
    expect(data.url).toBe(`${ORIGIN}/p/${data.id}`);
    expect(data.expiresAt).toBe('2027-01-07T12:00:00.000Z');

    const page = await handleShare(new Request(data.url), env, clock);
    expect(page.status).toBe(200);
    const body = await page.text();
    expect(body).toContain('Dusk &lt;1&gt;');
    expect(body).toContain('Price on request');
    expect(body).not.toContain('artist'); // the owner never reaches the client

    const pic = await handleShare(new Request(`${data.url}/picture`), env, clock);
    expect(pic.status).toBe(200);
    expect(pic.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await pic.arrayBuffer())).toEqual(JPEG);

    now = new Date('2027-01-08T00:00:00Z');
    expect((await handleShare(new Request(data.url), env, clock)).status).toBe(404);
    expect((await handleShare(new Request(`${data.url}/picture`), env, clock)).status).toBe(404);
  });

  it('answers a made-up link exactly like an expired one', async () => {
    const env = { SHARES: memoryBucket().bucket, API: api({}) };
    const res = await handleShare(new Request(`${ORIGIN}/p/AAAAAAAAAAAAAAAAAAAAAA`), env, clock);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no longer available');
    expect((await handleShare(new Request(`${ORIGIN}/p/..%2Fx`), env, clock)).status).toBe(404);
  });

  it('lets only the studio that made a link remove it', async () => {
    now = new Date('2026-10-09T12:00:00Z');
    const { bucket, items } = memoryBucket();
    const env = { SHARES: bucket, API: api({ 'sid=a': 'artist', 'sid=b': 'someone' }) };
    const made = await handleShare(upload('sid=a', { title: 'Dusk', details: '', picture: picture() }), env, clock);
    const { data } = (await made.json()) as { data: { id: string; url: string } };
    const remove = (cookie: string) =>
      handleShare(new Request(`${ORIGIN}/share/pictures/${data.id}`, { method: 'DELETE', headers: { Cookie: cookie } }), env, clock);
    expect((await remove('sid=b')).status).toBe(403);
    expect(items.size).toBe(3);
    expect((await remove('sid=a')).status).toBe(200);
    expect(items.size).toBe(0);
    expect((await handleShare(new Request(data.url), env, clock)).status).toBe(404);
  });

  it('lists only the signed-in studio’s own links, expired ones marked', async () => {
    now = new Date('2026-10-09T12:00:00Z');
    let n = 0;
    const counting: ShareClock = { now: () => now, randomBytes: (k) => new Uint8Array(k).fill(++n) };
    const { bucket } = memoryBucket();
    const env = { SHARES: bucket, API: api({ 'sid=a': 'artist', 'sid=b': 'someone' }) };
    await handleShare(upload('sid=a', { title: 'First', details: '', picture: picture() }), env, counting);
    now = new Date('2026-10-10T12:00:00Z');
    await handleShare(upload('sid=a', { title: 'Second', details: '', picture: picture() }), env, counting);
    await handleShare(upload('sid=b', { title: 'Not mine', details: '', picture: picture() }), env, counting);
    const list = (cookie: string | null) =>
      handleShare(new Request(`${ORIGIN}/share/pictures`, { headers: cookie ? { Cookie: cookie } : {} }), env, counting);
    expect((await list(null)).status).toBe(401);
    now = new Date('2027-01-08T00:00:00Z');
    const { data } = (await (await list('sid=a')).json()) as { data: { title: string; expired: boolean }[] };
    expect(data.map((l) => [l.title, l.expired])).toEqual([['Second', false], ['First', true]]);
  });
});
