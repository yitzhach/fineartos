# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.
## Goal
- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase.
## Now
- Tree green, 734 tests, IndexedDB v8 (no bump). Phase 4: Visualizer + selling
  part 1 shipped 2026-10-09.
- First-load JS 99.1 KB gzip (budget 100): next shell code MUST split something out.
- Notes autosave 0.8 s + on close (blur alone lost notes, 2026-10-07).
## Done
- Phase 4 selling pt 1: `shows/selling.ts` (sell, tally, receipt, trash/put
  back/drop sale; tested). Shows window → Selling: Sold → Record sale (price
  prefilled from asking), tally line, receipt via mailto/sms, Take the sale
  back → Trash kind `sale`. Books read the sale off the piece (no extra row).
- Phase 4 Visualizer: `visualizer/placement.ts` (marks → wall, start, drag,
  clamp, draw transform; tested) + lazy `visualizer/ui/VisualizerWindow`.
  Corners+wall size or known length; unsized pieces listed as left out.
  Launcher entry, G V, dock tool. Mock Visualizer removed.
- Phase 3 pt 2: DB v8 `boothMedia`; loop video ≤350 MB straight loop; phone
  dock 6 + Trash; guest book 5 s quiet → loop; slides crossfade 1.5 s.
- Phase 2: v7 guests/notes/clients/contacts; Clients joined by email/phone
  only; Notes pin to anything; vCard/CSV import; Quick capture.
- Phase 3 pt 1: `booth/` (PIN, panels, idle); BoothMode replaces the shell
  while on and captures shell keys/undo.

## Decisions (keep)
- `/v1/*`, `/assistant/*` never cached by `sw.js` (live sign-in data).
- Note in a folder = `pin {kind:'project'}`; folder record holds no notes.
  Home screen = optional `onDesktop`. Old notes stay Notes-only. No DB bump.
- System bar search is the launcher; actions only when runnable (rule 8).
- Snap keys Alt+Shift+arrows; tab keys Ctrl/⌘+Alt+arrows and Alt+1–9 work
  while typing (the sheet says so). G, / and ? only outside text fields.
- After a live drag, Frame resets style to the last-drawn rect (React diffs props).
- Free = runs on device; paid = costs money. No plan shown before billing.
- Updates travel with their commission's export. Books file two-way, CSV
  one-way. Payment due: invoiced commission drops out; totals per currency.
- Emptying the Trash reloads BEFORE the entries leave the Trash, else the
  destroyed records flash back for a frame.
- Shared modules: split cheap helpers out of the entry chunk; don't re-export.
- Clients/Notes wiring lives in lazy `app/PeopleTools.tsx`; the shell only
  reads profiles (follow-ups, search) and notes. Keep `buildPeople` out of
  the entry chunk. Person id = first identity key; resolve via `personFor`.
- Thumb mode never shows an original while its thumb is missing (200 full
  decodes = the stall). Blank tile until the backfill reaches it.
- Booth on-flag persists: a reload must land back in the booth, not the studio.
- Guest book quiet timeout (5 s) returns to the loop with no PIN.
- Website panel only after the artist ticks "I can see my site" (no detection
  possible); otherwise the QR panel covers it.
- Booth pieces = today's show pieceIds ∪ inCurrentShow, minus hidden.
- Trashed sale lives on the piece (`photo.trashedSales`), not in the Trash
  list: an edit meanwhile can't lose it. Put back refuses if resold since.
  Only show sales (have `id`+`before`) are trashable; old hand sales aren't.
- `shows/selling` is dynamic-imported from App + useTrash (entry budget).
- Visualizer room photo = window state only (client's room, minutes of use;
  no new store). Piece drawn from the thumbnail, element 12 px/in.
## Dead ends (do not retry)
- Two builds of one commit share `sw.js?v=` → SW never updates. Commit first.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)
1. Phase 4 selling pt 2: payment link/QR per piece (Settings has payment
   instructions; per-piece link optional field), consignment splits (sale
   `fee` from a show/gallery %), then prints: price list, wall labels, COA.
   Free entry-chunk bytes first (99.1/100).
2. Owner checks, NOT tested: selling on a real tablet at a show; receipt
   opening Mail/Messages on iOS/Android; Visualizer w/ a real room photo on iPad/phone; booth likes w/ real "Hanging right now" piece;
   5 s guest-book timeout on tablet; loop video + phone dock on devices.
## Files (path — why)
- `src/app/*` — the hooks. `src/App.tsx` — wiring, `runAction`, render.
- `scripts/check-clients-notes.mjs` — Phase 2; needs `OLD_DIST` (v6 build).
- `src/studio/` — assistant: actions (device tools), snapshot, session hint, UI.
- `scripts/check-assistant.mjs` — platform faked at network; 19/19.
- `scripts/check-notes-place.mjs` — notes save on close, home screen, folder; 8/8.
- `scripts/check-booth.mjs` — Phase 3; 22 checks, tablet + phone, offline.
- `scripts/check-visualizer.mjs` — 30 checks, desktop + phone touch; `ROOM=` a photo.
- `scripts/check-selling.mjs` — Phase 4 gate; 32 checks, desktop + phone.

## Verify (tested / NOT tested)
- Tested: unit 734; `check-selling` 32/32 (sell → Artwork, Finance, tally;
  take back, reload, put back, empty; 2nd tab); `check-visualizer` 30/30;
  `check-shows-trash`, `check-lazy-thumbs` pass. NOT: real devices, iOS
  mail/sms hand-off, real room photo, lighting by eye.
- Phase 3: `check-booth` 22/22, `check-booth-media` 9/9. NOT: likes, iPad,
  350 MB on a tablet. Media check timed out once on reload (watch it).
- Earlier phases: `scripts/check-*` pass. NOT: mic, vCard, camera, dark sheets,
  iPad keys, deployed URL (proxy 403), 861–1000px, iOS print.

## Resume
- Read `CLAUDE.md`, then only the Phase 4 section of `BUILD_PLAN.md`.
- Push to `main` (deploys). Browser checks: see `TESTING.md`.
