/**
 * Offline support for Artist OS.
 *
 * The app shell is cached on install, so once the app has been opened online
 * the artist can open it again with no network — create, edit, reopen and
 * preview local drafts. Documents and images are not cached here; they live in
 * IndexedDB, which the page owns.
 *
 * There is no background sync. The queue is drained when the app is open and
 * online, because a browser makes no promise to run anything while it is shut.
 */

const CACHE = 'artist-os-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        '/',
        '/index.html',
        '/manifest.webmanifest',
        // The bundled wallpapers are part of the shell: a desktop that loses
        // its background offline would look broken rather than offline.
        '/wallpapers/plaster.svg',
        '/wallpapers/dusk.svg',
        '/wallpapers/linen.svg',
      ]),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navigations fall back to the cached shell so a reload offline still opens.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Built assets are content-hashed, so a cache hit is always the right file.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
