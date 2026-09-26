# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase, one or two phases per pass.

## Now

- Tree green, 646 tests, IndexedDB v6. Phase 1 part 1 done; part 2 not started.
- First-load JS 162 KB gzip (one 537 KB chunk); <100 KB target is part 2.

## Done

- Phase 0: search box (`launcher.ts`, `Launcher.tsx`) and tiling (`tiling.ts`).
- Phase 1 part 1:
  - `App.tsx` 3,258 → ~2,430 lines. State in `src/app/`: `useStudioData`,
    `useWindows`, `useTrash` (state + actions), `useShellKeys` (keys, search
    box entries, `?` sheet), `usePrefs`, `useUndo`, `useObjectUrls`.
  - One-record saves: `persistence/records.ts` holds the store orders (the
    repository sorts with them too), upsert/remove, trash filters, image key.
    A save puts its record into state; no store re-read. `reload()` only for
    bulk writes (imports, photo import, empty Trash, remove demo, online).
  - State holds every record, Trash included; visible lists are derived, so
    Trash/Put back need no read.
  - Startup (`os/startup.ts`): restore saved windows, else newest commission.
  - Keys: `os/keys.ts` (⌘/Ctrl names), `os/shortcuts.ts` + `ShortcutSheet.tsx`;
    `?` opens it, search box "Keyboard shortcuts" too (not on phone).
  - Fixed: Ctrl+Z after Put back said "Undone" and did nothing (stale lists).

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

## Dead ends (do not retry)

- Upgrade check with two builds of one commit: same `sw.js?v=` → SW never
  updates. Commit before building the new one. Kill stray `vite preview`.
- Live-DOM drag without the style reset on release: window stayed at pointer.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)

1. Phase 1 part 2: lazy-load tools (Finance, Connect+QR lib, darkroom,
   Artwork, Shows, invoice editor, Settings) with idle warm-up so the SW has
   all for offline, failed load says so + Reload; thumbnails (small WebP
   beside each original, backfill existing photos, image map per image).
   Done when: <100 KB gzip first load, 200 photos no stall, offline check.
2. Phase 2: Clients + notes; guest book into IndexedDB v7 with visible failure.
3. Visualizer scope: settle with the artist before Phase 4.

## Files (path — why)

- `src/app/*` — the hooks. `src/App.tsx` — wiring, `runAction`, render.
- `src/persistence/records.ts` — orders, upsert, visible lists, image key.
- `src/os/startup.ts`, `src/os/keys.ts`, `src/os/shortcuts.ts` — pure, tested.
- `scripts/check-shell-split.mjs` — 18 browser checks for part 1.

## Verify (tested / NOT tested)

- Tested: unit 646; `check-shell-split` (0 store reads per keystroke — old
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
