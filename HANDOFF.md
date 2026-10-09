# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.
## Goal
- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase.

## Now
- Tree green, 701 tests, IndexedDB v8. Booth loop: guest-book timeout, back button,
  1.5 s crossfade, 350 MB video (2026-10-09).
- First-load JS 97.7 KiB gzip (check-lazy-thumbs measures KiB; budget 100).
- Notes fix (2026-10-07): typing autosaves (0.8 s + on close; blur alone lost
  notes), Title field, Save button, "Keep it on" Notes only / Home screen / folder.

## Done
- Phase 3 part 2 (2026-10-09): DB v8 `boothMedia` (additive). Loop video ≤350 MB,
  muted, fades through dark at loop point. Phone dock: 6 apps + Trash
  (`Dock.tsx`). Guest book: 5 s quiet → loop "(timed out)", no PIN; "Back to
  the loop" in tab bar. Slides crossfade 1.5 s (`booth-slide-over`). Constants
  in `booth.ts`. `check-booth-media.mjs` 12/12.
- Phases 0–1: search box, tiling, hooks in `src/app/`, lazy tools
  (`app/lazyTools.tsx`), thumbnails backfilled by `useObjectUrls`.
- Phase 2: v7 stores guests/notes/clients/contacts (`persistence/db.ts`).
  Guest book copied from localStorage on load, old key moved to
  `artistOS.guestBook.movedToDatabase`; write failures shown. Clients
  (`clients/clients.ts`) built from commissions, invoices, guests, imported
  contacts; auto-joined only by email/phone, same name → offered. Profile
  keeps tags, follow-up (Coming up), note, merges, `label`. Notes
  (`notes/notes.ts`) pin to anything, go to the Trash. vCard/CSV import.
  Quick capture (phone + button, search box action). G L clients, G N notes.
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
## Dead ends (do not retry)
- Two builds of one commit share `sw.js?v=` → SW never updates. Commit first.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)
0. Booth likes with a real show piece: set "Hanging right now" on a piece,
   open booth mode, check the "Pieces you like" boxes show and save. NOT tested yet.
   Draft actions need a live check. Owner: is 5 s right on a real tablet?
1. Phase 3 part 2 (done 2026-10-09, see Done): owner to try the video and the
   phone dock on the tablet and phone.
2. Then Phase 4 — Visualizer scope settled: true size + perspective + lighting
   (see `BUILD_PLAN.md` Phase 4).
## Files (path — why)
- `src/app/*` — the hooks. `src/App.tsx` — wiring, `runAction`, render.
- `scripts/check-clients-notes.mjs` — Phase 2; needs `OLD_DIST` (v6 build).
- `src/studio/` — assistant: actions (device tools), snapshot, session hint, UI.
- `scripts/check-assistant.mjs` — platform faked at network; 19/19.
- `scripts/check-notes-place.mjs` — notes save on close, home screen, folder; 8/8.
- `scripts/check-booth.mjs` — Phase 3; 22 checks, tablet + phone, offline.

## Verify (tested / NOT tested)
- Tested: unit 701; `check-booth` 22/22; `check-booth-media` 9/9 (v7→v8 with
  old tab open, video in loop + reload, phone dock 7 vs tablet 14).
  NOT: likes, blocked-tab path, crossfade with 2+ pieces, video fade by eye,
  350 MB on a real tablet, iPad. One reload timeout in the media check once,
  passed on re-run (watch it).
- Earlier phases: `scripts/check-*` pass. NOT: real mic, vCard, camera, dark
  sheets, iPad keys, deployed URL (proxy 403), 861–1000px, iOS print.

## Resume
- Read `CLAUDE.md`, then only the Phase 3 section of `BUILD_PLAN.md`.
- Push to `main` (deploys). Browser checks: see `TESTING.md`.
