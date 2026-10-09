# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.
## Goal
- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase.
## Now
- Tree green, 752 tests, IndexedDB v8 (no bump). Phases 4 + 5 built 2026-10-09.
- First-load JS 98.9 KB gzip (budget 100). ArtworkInspector now lazy. Next
  win if needed: defer `os/launcher.ts` tables (12 KB raw) until search opens.
## Done
- Phase 5 mailing list: `connect/mailing.ts` (built, never stored: consenting
  guests w/ email + clients `mayEmail: true`; latest guest answer wins; a
  client No removes; segments show/liked/tag; Kit-style CSV; BCC mailto ≤30;
  `showLink` adds utm_* show name). Connect → Mailing list tab; Show → Export
  sign-ups (one tap, the gate); QR "For a show"; Clients → May email.
- Phase 4 selling pt 1: `shows/selling.ts` (sell, tally, receipt, trash/put
  back/drop sale; tested). Shows window → Selling: Sold → Record sale (price
  prefilled from asking), tally line, receipt via mailto/sms, Take the sale
  back → Trash kind `sale`. Books read the sale off the piece (no extra row).
- Phase 4 selling pt 2: `photo.paymentLink` (PhotoWindow field) else Settings
  Square link → Pay QR (http/https only). `show.takePercent` → sale `fee`;
  tally adds "kept". `shows/prints.ts`: price list, 3.5×2in wall labels, COA
  (blank line if no studio name) printed via hidden iframe (`ui/printSheet`).
- Phase 4 Visualizer: `visualizer/placement.ts` (tested) + lazy window;
  corners+wall size or known length; unsized pieces left out. G V.
- Phases 0–3: see `BUILD_PLAN.md` (DB v8 `boothMedia`; v7 guests/notes/
  clients/contacts; booth PIN/panels/loop video).

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
- `check-lazy-thumbs` stall check (<500 ms) is noisy here: old+new builds
  interleaved both 420–590 ms (2026-10-09). Compare interleaved, not once.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)
1. Phase 6 — Calendar and tasks (`BUILD_PLAN.md`). Read only that section.
2. Owner checks, NOT tested: CSV import into Mailchimp/Kit/Buttondown; BCC
   draft in iOS Mail; scanning the show QR; real print output (labels cut size, COA on
   Letter/A4, iOS print); pay QR scanned by a phone; selling on a tablet; receipt
   opening Mail/Messages on iOS/Android; Visualizer w/ a real room photo on iPad/phone; booth likes w/ real "Hanging right now" piece;
   5 s guest-book timeout on tablet; loop video + phone dock on devices.
## Files (path — why)
- `src/app/*` — the hooks. `src/App.tsx` — wiring, `runAction`, render.
- `scripts/check-clients-notes.mjs` — Phase 2; needs `OLD_DIST` (v6 build).
- `src/studio/` — assistant: actions (device tools), snapshot, session hint, UI.
- `scripts/check-assistant.mjs` (19), `check-notes-place.mjs` (8) — Phase 2/3.
- `scripts/check-booth.mjs` — Phase 3; 22 checks, tablet + phone, offline.
- `scripts/check-visualizer.mjs` — 30 checks, desktop + phone touch; `ROOM=` a photo.
- `scripts/check-selling.mjs` — Phase 4 gate; 42 checks, desktop + phone.
- `scripts/check-mailing.mjs` — Phase 5 gate; 24 checks, desktop + phone.
## Verify (tested / NOT tested)
- Tested: `check-mailing` 24/24, `check-booth` 22/22. unit 752; `check-selling` 42/42 (take %, pay QR, 3 print sheets'
  HTML, sell → Artwork, Finance $ net, tally; Trash round-trip; 2nd tab); `check-visualizer` 30/30;
  `check-shows-trash`, `check-lazy-thumbs` pass. NOT: real devices, iOS
  mail/sms hand-off, real room photo, lighting by eye.
- Phase 3: `check-booth` 22/22, `check-booth-media` 9/9. NOT: likes, iPad,
  350 MB on a tablet. Media check timed out once on reload (watch it).
- Earlier phases: `scripts/check-*` pass. NOT: mic, vCard, camera, dark sheets,
  iPad keys, deployed URL (proxy 403), 861–1000px, iOS print.

## Resume
- Read `CLAUDE.md`, then only the Phase 6 section of `BUILD_PLAN.md`.
- Push to `main` (deploys). Browser checks: see `TESTING.md`.
