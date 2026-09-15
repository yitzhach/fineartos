# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Ship to `main`; Cloudflare rebuilds in ~1 min.

## Now

- Tree green. 522 tests pass. Branch `claude/determined-rubin-q9irx9` (the
  session briefing named it; `CLAUDE.md` says `main` — not merged yet).
- Nothing half-finished. Nothing from the Shows / backup scope is built —
  it is written down in `FUTURE_BUILD.md` only.
- Dock built: New, Home, Projects, Invoices, Finder, Connect, Artwork,
  Finance, Trash. Placeholders: Shows, Visualizer.

## Done

- **PDF hand-off for a client update** — the last unused `HandoffChannel`.
  A "Print / Save as PDF" button beside Save as a page; the sheet is built
  from the records into a hidden iframe and handed to the browser's own print
  dialog, which is where every browser keeps Save as PDF.
- `renderUpdatePrintHtml` is the paper cut of the page: white, point sizes,
  break-inside rules, and **no buttons** — the studio address is printed as
  words, because a dead mailto button on paper is worse than none.

## Decisions (keep)

- The PDF goes through the print dialog, not a PDF library: no dependency,
  and it is the same route the invoice and the client document already take.
- The print frame is removed on `afterprint`, with a 60s fallback. Removing
  it straight after `print()` cancels the dialog in some browsers.
- `printUpdatePage` returns `'unsupported'` rather than throwing when the
  browser has no print; nothing is recorded then, and the message says so.
- Payment due: nothing counted twice (an invoiced commission drops out),
  one total per currency, drafts excluded but counted and named, a commission
  has terms not a due date so it is never overdue, and the year selector is
  ignored on purpose. Sale-of-a-piece rows have no invoice behind them.
- `PROJECT_GUIDE.md` predates Finance and has no Finance section. Do not
  assume it is current.

## Dead ends (do not retry)

- Nothing found this session.

## Next (numbered)

0. Agreed order for the newly scoped work, once it starts: backup and restore
   → proportional Trash confirmation → contacts as their own records. Shows
   ships as a hosted shell, never as records here. See `FUTURE_BUILD.md`.
1. Deleting a commission forever orphans its `clientUpdates` rows. Emptying
   the Trash removes document, invoices and pictures, not those.
2. Export/import does not carry updates or expenses (`persistence/portable.ts`
   predates both).
3. Update from a milestone: ticking a stage offers to tell the client.
4. Client status on a commission's Overview tab — last update, anything
   unanswered — so the Client tab need not be opened.
5. Shows — now scoped as a hosted shell, not records. `FUTURE_BUILD.md`.
6. Visualizer. No design yet.
7. Sign-in gates everything else: cloud saving, guest book online, real email,
   Square, a client page that can receive an approval. See `FUTURE_BUILD.md`.

## Files (path — why)

- `src/commission/updateRender.ts` — `renderUpdatePrintHtml`, the paper sheet.
- `src/commission/updateDownload.ts` — `printUpdatePage`, the hidden frame.
- `src/commission/ui/UpdatesPane.tsx` — the button row.
- `src/App.tsx` — `handOverUpdate`, where the `pdf` channel is handled.
- `scripts/check-update-pdf.mjs` — the browser check for it.
- `src/persistence/portable.ts` — Next #2 lands here.
- `src/commission/updates.ts` — Next #1 and #3 both touch it.
- `FUTURE_BUILD.md` — Shows-as-a-shell, light sync rungs, and the backup
  scope. Written this session, nothing built.

## Verify (tested / NOT tested)

- **Tested**: 522 unit tests (7 new across `updateRender` / `updates`).
  Chromium against an existing database, with a second tab open, and at phone
  width: the sheet carries headline, note and the sign-off ask, prints no
  mailto, the hand-off records once, the second tab sees it, no console
  errors. `node scripts/check-update-pdf.mjs` against `npm run preview`.
- **NOT tested**: a real print dialog (headless makes `print()` a no-op — the
  frame it would print is checked instead). A picture inlined into the sheet:
  the demo commission has none. Light mode, tablet width, the deployed URL.

## Resume

- A fresh session starts in `yitzhach/newTEST`, an unrelated art show tracker.
  Attach this repo first: `add_repo(owner="yitzhach", repo="fineartos",
  access="push")`, run the clone command it returns into `/home/user/fineartos`,
  then `register_repo_root` on that directory. A branch instruction in the
  session briefing belongs to the other repo; here it is `main`.
- The SessionStart hook installs deps and runs the suite; trust its line.
- Read `CLAUDE.md`, then execute Next #1.
