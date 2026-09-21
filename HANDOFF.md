# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Ship to `main`; Cloudflare rebuilds in ~1 min.

## Now

- Tree green. 541 tests pass. Four items off the old Next list, in one go.
- Nothing half-finished.
- Dock built: New, Home, Projects, Invoices, Finder, Connect, Artwork,
  Finance, Trash. Placeholders: Shows, Visualizer.

## Done

- **PDF hand-off** on a client update: the self-contained page rendered into
  a hidden iframe and handed to the browser's own print dialog.
- **Emptying the Trash** destroys a commission's client updates with it; they
  were left behind as orphans. The confirmation counts and names them.
- **Export is version 2**, carrying the commission's client updates; version
  1 files still read.
- **The books save as a file** that reads back in (Finance → Profit and loss,
  beside the CSV); the same file twice does not double the rows.
- **Ticking a stage off offers to tell the client** — starts an update about
  that stage, writes and sends nothing.

## Decisions (keep)

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

- Nothing found this session.

## Next (numbered)

1. Client status on a commission's Overview tab — last update, anything
   unanswered — so the Client tab need not be opened.
2. Shows, the 4th tool. Settle scope first: name, venue, dates, booth fee,
   deadline, status, pieces taken, guest entries. Artwork owns the piece and
   where it is; Shows owns the event; Finance reads both.
3. Visualizer. No design yet.
4. Sign-in gates everything else: cloud saving, guest book online, real email,
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

- **Tested**: 541 unit tests (26 new). Chromium at 1440px and 390px, existing
  database, second tab open: PDF hand-off recorded and the frame cleaned up;
  emptying asks "3 records" naming the update and leaves none, second tab
  agrees; the export carries the update; the books file adds nothing the
  second time; the stage offer fills the headline, saves nothing, offers once.
  No console errors, no overflow.
- **NOT tested**: what the print dialog actually produces — headless Chromium
  treats `window.print()` as a no-op, so the paper layout is unseen. Light
  mode and tablet width. iOS Safari printing. Nothing tested on the deployed
  URL.

## Resume

- Read `CLAUDE.md`, then execute Next #1.
- The SessionStart hook installs deps and runs the suite; trust its line.
- Work on `main` in `yitzhach/fineartos`. A branch instruction in a session
  briefing belongs to another repo.
- Browser checks: `npm run build && npx vite preview --port 4181`, then
  `node scripts/check-*.mjs`. Scripts must live in the repo to resolve
  playwright.
