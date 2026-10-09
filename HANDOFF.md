# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.
## Goal
- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase.
## Now
- Tree green, 723 tests, IndexedDB v8. Visualizer window built (2026-10-09).
- Booth loop video: straight loop, no fade; Choose/Replace is a primary .btn.
- First-load JS 98.5 KB gzip (check-lazy-thumbs; budget 100) — tight.
- Notes autosave 0.8 s + on close (blur alone lost notes, 2026-10-07).
## Done
- Phase 4 Visualizer: `visualizer/placement.ts` (marks → wall, start, drag,
  clamp, draw transform; tested) + lazy `visualizer/ui/VisualizerWindow`.
  Corners+wall size or known length; unsized pieces listed as left out.
  Launcher entry, G V, dock tool. Mock Visualizer removed.
- Phase 3 part 2 (2026-10-09): DB v8 `boothMedia` (additive). Loop video ≤350 MB,
  muted, straight loop (fade through dark removed: read as a jump). Phone
  dock: 6 apps + Trash (`Dock.tsx`). Guest book: 5 s quiet → loop "(timed out)", no PIN; "Back to
  the loop" in tab bar. Slides crossfade 1.5 s (`booth-slide-over`). Constants
  in `booth.ts`. `check-booth-media.mjs` 12/12.
- Phase 2: v7 stores guests/notes/clients/contacts (`persistence/db.ts`).
  Guest book copied from localStorage on load, old key moved to
  `artistOS.guestBook.movedToDatabase`; write failures shown. Clients
  (`clients/clients.ts`) built from commissions, invoices, guests, imported
  contacts; auto-joined only by email/phone, same name → offered. Profile
  keeps tags, follow-up (Coming up), note, merges, `label`. Notes
  (`notes/notes.ts`) pin to anything. vCard/CSV import. Quick capture.
- Phase 3 part 1: `booth/booth.ts` (PIN hash+salt, lockout, panels, pieces,
  price line, idle/slide timing), `booth/storage.ts` (settings + on-flag in
  localStorage), `booth/ui/BoothSetup` (Connect → "Booth mode" tab),
  lazy `booth/ui/BoothMode` (loop, panels, likes on sign-up, PIN pad).
  App returns only BoothMode while on; capture keydown holds shell keys/undo.

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
- Visualizer room photo = window state only (client's room, minutes of use;
  no new store). Piece drawn from the thumbnail, element 12 px/in.
## Dead ends (do not retry)
- Two builds of one commit share `sw.js?v=` → SW never updates. Commit first.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)
1. Rest of Phase 4: selling at the booth (sold in two taps, day's tally,
   prints) — see `BUILD_PLAN.md`. Sale must be undoable via Trash.
2. Owner checks, NOT tested: Visualizer w/ a real room photo on iPad/phone; booth likes w/ real "Hanging right now" piece;
   5 s guest-book timeout on tablet; loop video + phone dock on devices.
## Files (path — why)
- `src/app/*` — the hooks. `src/App.tsx` — wiring, `runAction`, render.
- `scripts/check-clients-notes.mjs` — Phase 2; needs `OLD_DIST` (v6 build).
- `src/studio/` — assistant: actions (device tools), snapshot, session hint, UI.
- `scripts/check-assistant.mjs` — platform faked at network; 19/19.
- `scripts/check-notes-place.mjs` — notes save on close, home screen, folder; 8/8.
- `scripts/check-booth.mjs` — Phase 3; 22 checks, tablet + phone, offline.
- `scripts/check-visualizer.mjs` — 30 checks, desktop + phone touch; `ROOM=` a photo.

## Verify (tested / NOT tested)
- Tested: unit 723; `check-visualizer` 30/30 (synthetic room, 2nd tab);
  `check-lazy-thumbs` pass. NOT: real room photo, iPad, lighting by eye.
- Earlier: unit 701; `check-booth` 22/22; `check-booth-media` 9/9 (v7→v8 with
  old tab open, video in loop + reload, phone dock 7 vs tablet 14).
  NOT: likes, blocked-tab path, crossfade with 2+ pieces, video fade by eye,
  350 MB on a real tablet, iPad. One reload timeout in the media check once,
  passed on re-run (watch it).
- Earlier phases: `scripts/check-*` pass. NOT: mic, vCard, camera, dark sheets,
  iPad keys, deployed URL (proxy 403), 861–1000px, iOS print.

## Resume
- Read `CLAUDE.md`, then only the Phase 4 section of `BUILD_PLAN.md`.
- Push to `main` (deploys). Browser checks: see `TESTING.md`.
