# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase, one or two phases per pass.

## Now

- Tree green, 657 tests, IndexedDB v6. Phase 1 done. Phase 2 next.
- First-load JS ~96–98 KB gzip (was 162). Little headroom: new tools go lazy.

## Done

- Phase 0: search box (`launcher.ts`, `Launcher.tsx`) and tiling (`tiling.ts`).
- Phase 1 part 1: state in `src/app/` hooks; one-record saves
  (`persistence/records.ts`); startup restore (`os/startup.ts`); key names
  + `?` sheet (`os/keys.ts`, `os/shortcuts.ts`).
- Phase 1 part 2: `app/lazyTools.tsx` (every tool + big window lazy, idle
  warm-up 3 s after load, boundary says "could not load" + Reload; stray
  chunk failure → message via `isLoadFailure`). Import/export, downloads,
  demo seed are `import()`ed at use. Thumbnails: `StoredImage.thumb`
  (null = could not make), `photo/thumbnail.ts`, `useObjectUrls` patches
  per id, backfills 2 at a time, batches redraws. Full originals only for
  open photo/darkroom/commission windows + preview ±1 (`fullImageIdsKey`).

## Decisions (keep)

- System bar search is the launcher; the old doc filter does not go back there.
- Launcher offers an action only when it can run now (rule 8).
- Snap keys Alt+Shift+arrows; tab keys Ctrl/⌘+Alt+arrows and Alt+1–9 work
  while typing (the sheet says so). G, / and ? only outside text fields.
- The shortcut sheet lists only keys with a handler; snapping left out on phone.
- After a live drag, Frame resets its style to the last-drawn rect before
  committing: React diffs props, not the DOM.
- Free = runs on the device; paid = costs money. No plan shown before billing.
- Tools render in `renderContent`; `renderToolbar` is a caption. Print = browser.
- Updates travel with their commission's export. Books file two-way, CSV one-way.
- Payment due: an invoiced commission drops out; totals one per currency.
- Emptying the Trash reloads BEFORE the entries leave the Trash, else the
  destroyed records flash back for a frame.
- Direct `repo.save*` in App only where `data.reload()` follows, else stale.
- `PROJECT_GUIDE.md` predates Finance and tiling. Do not assume it is current.

- A module shared by the entry and a lazy chunk lands whole in the entry:
  split cheap helpers out (`photo/neutral.ts`, `invoice/mailto.ts`,
  `lib/demoSeeded.ts`, `os/mock/names.ts`) — do not re-export them back.
- Thumb mode never shows an original while its thumb is missing (200 full
  decodes = the stall). Blank tile until the backfill reaches it.

## Dead ends (do not retry)

- Upgrade check with two builds of one commit: same `sw.js?v=` → SW never
  updates. Commit before building the new one. Kill stray `vite preview`.
- Live-DOM drag without the style reset on release: window stayed at pointer.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)

1. Phase 2: Clients + notes; guest book into IndexedDB v7 with visible
   failure. New tools lazy (first load has ~2 KB headroom).
2. Visualizer scope: settle with the artist before Phase 4.

## Files (path — why)

- `src/app/*` — the hooks. `src/App.tsx` — wiring, `runAction`, render.
- `src/persistence/records.ts` — orders, upsert, visible lists, image key.
- `src/os/startup.ts`, `src/os/keys.ts`, `src/os/shortcuts.ts` — pure, tested.
- `scripts/check-shell-split.mjs` — 18 browser checks for part 1.
- `scripts/check-lazy-thumbs.mjs` — 16 for part 2 (size, offline, failed
  load, 200 photos, backfill, second tab).

## Verify (tested / NOT tested)

- Tested: unit 657; `check-lazy-thumbs` all pass (96 KB, longest task
  370 ms seeding 200 photos, 200/200 thumbs); `check-shell-split` (0 store reads per keystroke — old
  build did 7; startup restore vs newest; 2nd tab; Mac UA ⌘; phone sheet;
  Put-back undo — old build fails it), `check-launcher-tiling`,
  `check-desktop`, `check-coming-up`, `check-shows-trash`, `check-owed`,
  `check-books-and-stage`: all pass.
- NOT tested: shortcut sheet in dark mode, real Mac/iPad keyboards, a
  database from before this change with many records, deployed URL (proxy
  403 from container), real iPad drag, 861–1000px widths, iOS printing.
- Nit, not fixed: desktop buttons show faintly through tiled titlebars.
## Resume

- Read `CLAUDE.md`, then only the Phase 1 section of `BUILD_PLAN.md`.
- The SessionStart hook installs deps and runs the suite; trust its line.
- Push to `main` (deploys) and to the session's `claude/*` branch if named.
- Browser checks: see `TESTING.md`.
