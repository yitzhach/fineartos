/* ==========================================================================
   What the audit needs to know about THIS site. Everything else in qa/ is
   shared (yitzhach/site-qa); this file, audit-baseline.json and tests/site/
   belong to this project, and `site-qa update` never touches them.
   ========================================================================== */
import type { SiteConfig } from './lib/site';

const config: SiteConfig = {
  // Runs from qa/; cwd '..' is the repo root. Playwright allows 30s to come
  // up, so this skips the typecheck (npm test / npm run build own that) and
  // the postinstall build: a plain vite build fits, tsc -b + vite cold does not.
  serve: {
    command: "([ -d node_modules ] || npm ci --ignore-scripts) && npx vite build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    cwd: "..",
    readyURL: "http://127.0.0.1:4173/",
  },
  baseURL: "http://127.0.0.1:4173/",

  // CHECK: every page worth auditing, relative to baseURL. Pages the site
  // links to but this list misses show up as unlistedPages in results.
  pages: ['./'],

  // Freeze the page's clock if anything on it depends on today's date.
  // fixedTime: '2026-01-15T12:00:00',

  // Every other host is blocked during tests, so no result depends on the
  // network. Add a host here only if the page cannot work without it.
  allowHosts: [],

  // Findings that are the site working as designed, each with the reason:
  // { page: 'x.html', finding: 'network:404 data.json', why: '…' }
  accept: [],
};

export default config;
