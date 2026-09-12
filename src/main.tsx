import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

declare const __BUILD_COMMIT__: string;

// Offline support. Registration is best-effort: a browser that refuses it
// still runs the app, it just will not open without a network.
//
// The commit is in the URL on purpose. sw.js itself is the same file from one
// deploy to the next, so a browser comparing it byte for byte would find no
// change and never install anything — and a tab left open at a show would go
// on serving the old build with nothing to say so. A new commit is a new
// script URL, which is an update the browser acts on, and the worker reads
// the same value back to name its cache.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${__BUILD_COMMIT__}`).catch(() => {
      /* Offline preparation unavailable; the app still works online. */
    });
  });
}
