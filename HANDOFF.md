# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase, one or two phases per pass.

## Now

- Tree green, 621 tests, IndexedDB v6. Phase 0 done; nothing half-finished.

## Done

- Search box (`launcher.ts` + `Launcher.tsx`), system bar centre: Ctrl/⌘K
  anywhere, / when not typing. Tools by synonyms, actions only when they can
  run, records (commissions, invoices, folders, pieces, shows, guests).
  Phone: a button that opens a sheet. G then a letter opens a tool.
- Tiling (`tiling.ts`, `WindowState.snap`): Arrange menu (4 layouts, cascade,
  put back, auto-tile pref), drag titlebar to edge/corner with preview,
  Alt+Shift+arrows, titlebar snap menu, resnap when the desktop resizes.
- Frames move/resize themselves during a drag; App state set once on release
  (was a full App re-render per pointer move).
- Fixed: windows outranked bar/dock/search after ~20 focuses (`.desktop` layer
  ≥861px); desktop buttons drew over low-z windows (surface z 0); Alt+1–9
  preventDefault synchronous; titlebar `touch-action: none`; Projects list
  keeps its own filter at all widths; Coming up opens the show clicked.
- `BUILD_PLAN.md`: audit table, ideas, free/paid proposal, phases 0–10.

## Decisions (keep)

- System bar search is the launcher; the old doc filter does not go back there.
- Launcher offers an action only when it can run now (rule 8).
- Snap keys Alt+Shift+arrows: Ctrl/⌘+Alt+arrows already step tabs; Super
  belongs to the OS. G sequences and / only outside text fields; ⌘K anywhere.
- After a live drag, Frame resets its style to the last-drawn rect before
  committing: React diffs props, not the DOM.
- Free = runs on the device; paid = costs money to run. No plan shown in the
  app before billing exists.
- Tool windows render in `renderContent` only; `renderToolbar` gives a caption.
- Printing hands off to the browser (hidden iframe); no PDF is written here.
- Updates belong to their commission and travel in its export file.
- The books file is the two-way door; the CSV is the accountant's one-way one.
  An amount nobody recorded stays null through a round trip.
- Payment due: an invoiced commission drops out; totals one per currency;
  draft invoices named beside the total; a commission has terms, not a due date.
- `PROJECT_GUIDE.md` predates Finance and tiling. Do not assume it is current.

## Dead ends (do not retry)

- Upgrade check with two builds of one commit: same `sw.js?v=` → SW never
  updates. Commit before building the new one. Kill stray `vite preview`.
- Live-DOM drag without the style reset on release: a snap that kept the old
  top left the window where the pointer let go.

## Next (numbered)

1. BUILD_PLAN "Phase 1 — Speed and a lighter shell": lazy-load tools with idle
   warm-up (offline must still work), thumbnails, per-record state updates,
   split `App.tsx` (~3,200 lines), newest commission opens only when nothing
   was restored, per-platform key names, "?" shortcut sheet.
2. Phase 2: Clients + notes; guest book into IndexedDB v7 with visible failure.
3. Visualizer scope: settle with the artist before Phase 4.

## Files (path — why)

- `src/os/launcher.ts` — ranking, tool/action/record entries, G sequences.
- `src/os/Launcher.tsx` — the box, the phone sheet.
- `src/os/tiling.ts` — zones, layouts, snap/unsnap/resnap/cascade.
- `src/os/Frame.tsx` — live drag and resize, snap menu. Arrange: `SystemBar.tsx`.
- `src/App.tsx` — key handler, `runAction`, `onDragEndWindow`, auto-tile effect.
- `scripts/check-launcher-tiling.mjs` — 20 browser checks.

## Verify (tested / NOT tested)

- Tested: unit 621; `check-launcher-tiling` (1440/1024/390, reload, 2nd tab,
  z-order after 30 focuses — fails without the fix), `check-desktop`,
  `check-coming-up`, `check-shows-trash`; dark-mode screenshots. Deployed URL
  is blocked from the build container (proxy 403).
- NOT tested: real iPad drag, real Mac ⌥⇧ keys, 861–1000px widths, auto-tile
  with tab groups in a browser (unit only), deployed URL, guest-book picker,
  show Put back/undo, real print output, iOS Safari printing.
- Nit, not fixed: desktop buttons show faintly through tiled titlebars.

## Resume

- Read `CLAUDE.md`, then only the Phase 1 section of `BUILD_PLAN.md`.
- The SessionStart hook installs deps and runs the suite; trust its line.
- Push to `main` (deploys). If a session briefing names a `claude/*` branch,
  push there too.
- Browser checks: see `TESTING.md`.
