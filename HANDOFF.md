# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.

## Now

- Tree green. 560 tests pass. IndexedDB now v6 (adds `shows`).
- Nothing half-finished.
- Dock built: New, Home, Projects, Invoices, Finder, Connect, Artwork,
  Shows, Finance, Trash. Placeholder: Visualizer.

## Done
- Shows tool: status Considering/Applied/Accepted/Declined/Done; guest book
  picks show from list (old typed names still pickable); taking a piece sets
  Artwork location "At a show", taking off restores prior; booth fee → books
  row `show-fee:<id>` (Show fees) only when Accepted/Done, null stays null.
- Fixed: Artwork, Finance and Shows windows were drawn in the toolbar
  (body held the caption), so the frame scrolled and lost its title bar.
  Phone: desktop tools sit right of the icons, short labels; notice clears
  the dock; build stamp hidden <1100px. `scripts/check-desktop.mjs`.
- Desktop "Coming up" panel (`src/os/dashboard.ts` + `ComingUp.tsx`): show
  deadlines, shows starting/on, payments due or overdue, next 30 days.
  Home shows it. Tested: `scripts/check-coming-up.mjs`, desktop + phone.
  NOT tested: with many icons (panel can overlap a full icon grid), dark.
- Shows go to the Trash (fee row + pieces untouched there); emptying deletes
  fee row, restores pieces, count includes the fee row. Shows file export/
  import (`portable.ts`); import re-adds a missing fee row, not locations.
- Overview Client card via `clientStatus()` (updates.ts). Tested: unit +
  empty state in browser. NOT tested: filled card in browser, 2nd tab.
- Earlier: PDF hand-off, Trash empties updates, export v2, books file,
  stage-done offer (see git log).

## Decisions (keep)
- Tool windows render in `renderContent` only; `renderToolbar` gives a caption.

- Printing hands off to the browser; no PDF is written here. On paper the
  mailto buttons are dead controls, so the printed page prints the address
  and asks in words. Hidden iframe, not a new tab: a blocker eats the tab.
- Updates belong to their commission: they travel in its export file and die
  with it. Photographs travel in neither file; both name what is missing.
- The books file is the two-way door; the CSV stays the accountant's one-way
  one. An amount nobody recorded stays null through a round trip.
- A stage offers once, and never for a stage already told about.
- Payment due: an invoiced commission drops out, so nothing counts twice.
  Totals are one per currency. Draft invoices are named beside the total, not
  in it. A commission has terms, not a due date → never overdue.
- `PROJECT_GUIDE.md` predates Finance and has no Finance section. Do not
  assume it is current.

## Dead ends (do not retry)
- Upgrade check with two builds of one commit: same `sw.js?v=` → SW never
  updates. Commit before building the new one. Kill stray `vite preview`.

- Nothing found this session.

## Next (numbered)

1. Visualizer. No design yet — settle scope with the artist first.
2. Sign-in gates everything else: cloud saving, guest book online, real email,
   Square, a client page that can receive an approval. See `FUTURE_BUILD.md`.

## Files (path — why)

- `src/commission/updates.ts` — updates, `draftForMilestone`, `toldAbout`.
- `src/commission/updateRender.ts` — the page, now with a print mode.
- `src/commission/updateDownload.ts` — `printUpdatePage`, the iframe.
- `src/os/trash.ts` — `attachedIds`; the summary counts updates.
- `src/persistence/portable.ts` — both file formats.
- `src/finance/ui/FinanceWindow.tsx` — books file buttons, statement tab.
- `scripts/check-update-pdf.mjs`, `scripts/check-books-and-stage.mjs` — the
  browser checks for all four; run against `npm run preview -- --port 4181`.

## Verify (tested / NOT tested)
- Browser-check recipe: `TESTING.md` — open only when a check is needed.
- Tested: `scripts/check-shows*.mjs`, `check-coming-up`, `check-desktop` all
  pass (v5→v6 upgrade, Trash, file round-trip, 2nd tab, 390/820/1024).
- NOT tested: guest-book picker, show Put back/undo, dark mode.
- Earlier batch browser-tested (1440/390, existing DB, 2nd tab). NOT tested:
  real print output (headless no-op), iOS Safari printing, deployed URL.

## Resume

- Read `CLAUDE.md`, then execute Next #1.
- The SessionStart hook installs deps and runs the suite; trust its line.
- Work on `main` in `yitzhach/fineartos`. A branch instruction in a session
  briefing belongs to another repo.
- Browser checks: see `TESTING.md`.
