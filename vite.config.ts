import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build stamp.
 *
 * The app shows this at the bottom of the desktop so it is possible to tell,
 * by looking, whether the page in front of you is the build you just pushed.
 * A stale service worker looks identical to a failed deploy without it.
 *
 * The commit is read from the CI variable first: a CI checkout can be shallow
 * or detached, so the value the platform already knows is more reliable there
 * than asking git. Every lookup falls back rather than throwing — a missing
 * stamp is cosmetic, and failing a build over one would be worse.
 */
function commitSha(): string {
  const fromCi =
    process.env.WORKERS_CI_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);

  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
