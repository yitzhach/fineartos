/**
 * Noticing that the page is running an old build.
 *
 * This app is a single page that people leave open for days — at a show, on a
 * tablet on the table. A deploy replaces the files on the server, but a tab
 * that is already open goes on running the JavaScript it loaded, so a feature
 * that shipped an hour ago is genuinely not there until the page is reloaded.
 * From the outside that is indistinguishable from a broken deploy, which is
 * the same confusion the build stamp exists to clear up.
 *
 * So: watch the service worker, and when a newer one takes over, say so. The
 * page is never reloaded automatically — an artist may be halfway through
 * typing, and losing that to a background update would be a worse bug than
 * the stale build.
 *
 * Best-effort by design. A browser with no service worker, or one that
 * refuses to register it, simply never calls back.
 */

/** Checked this often while the tab is open, and whenever it is looked at. */
const CHECK_EVERY_MS = 15 * 60 * 1000;

export function onAppUpdate(ready: () => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};

  let stopped = false;
  const cleanups: (() => void)[] = [];

  /**
   * Whether a worker was already in charge when this page loaded. On a first
   * visit the worker installs and takes over a moment later, which is not an
   * update and must not be announced as one.
   */
  const hadController = Boolean(navigator.serviceWorker.controller);

  // A new worker taking control means new files are being served. sw.js calls
  // skipWaiting, so this is the usual way an update announces itself.
  const onController = () => {
    if (!stopped && hadController) ready();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onController);
  cleanups.push(() =>
    navigator.serviceWorker.removeEventListener('controllerchange', onController),
  );

  void navigator.serviceWorker.ready
    .then((registration) => {
      if (stopped) return;

      const watch = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const onState = () => {
          // Installed with something already in control: an update, not a
          // first visit. A first visit has nothing stale to warn about.
          if (worker.state === 'installed' && hadController && !stopped) {
            ready();
          }
        };
        worker.addEventListener('statechange', onState);
        cleanups.push(() => worker.removeEventListener('statechange', onState));
      };

      watch(registration.waiting);
      const onUpdateFound = () => watch(registration.installing);
      registration.addEventListener('updatefound', onUpdateFound);
      cleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound));

      // A tab open for a day never asks the server anything on its own.
      const check = () => void registration.update().catch(() => {});
      const timer = setInterval(check, CHECK_EVERY_MS);
      const onVisible = () => {
        if (document.visibilityState === 'visible') check();
      };
      document.addEventListener('visibilitychange', onVisible);
      cleanups.push(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
      });
    })
    .catch(() => {
      /* No service worker here; nothing to watch. */
    });

  return () => {
    stopped = true;
    for (const cleanup of cleanups) cleanup();
  };
}
