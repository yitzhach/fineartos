/**
 * The build stamp, bottom left of the desktop.
 *
 * This exists because a stale cached page and a failed deploy look exactly
 * the same from the outside. With the commit and the build time on screen,
 * "is this the version I just pushed?" is answered by looking rather than by
 * guessing.
 *
 * The values are baked in at build time by vite.config.ts. They describe when
 * the *bundle* was built, not when the page was opened.
 */

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

/** "11 Sep 2026, 03:40" in the viewer's own timezone. */
function formatBuildTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function BuildStamp() {
  const built = formatBuildTime(__BUILD_TIME__);

  return (
    <div className="build-stamp no-print">
      <span className="wordmark">Artist OS</span>
      <span className="sep" aria-hidden="true">·</span>
      <span title={`Built from commit ${__BUILD_COMMIT__} at ${__BUILD_TIME__}`}>
        build {__BUILD_COMMIT__} · {built}
      </span>
    </div>
  );
}
