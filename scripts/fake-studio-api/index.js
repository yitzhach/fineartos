// A stand-in studio-api for scripts/check-share.mjs: the cookie `studio=ok`
// is signed in, anything else is not. Never deployed.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/v1/me' && (request.headers.get('Cookie') ?? '').includes('studio=ok'))
      return Response.json({ data: { user: { id: 'artist-1', email: 'artist@example.com' } } });
    return Response.json({ error: { code: 'unauthenticated', message: 'Sign in.' } }, { status: 401 });
  },
};
