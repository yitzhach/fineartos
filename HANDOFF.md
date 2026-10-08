# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.
## Goal
- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase.

## Now
- Tree green, 681 tests, IndexedDB v7 (unchanged). Phase 3 part 1 done.
- First-load JS 97.7 KiB gzip (check-lazy-thumbs measures KiB; budget 100).
- Notes fix (2026-10-07): typing autosaves (0.8 s + on close; blur alone lost
  notes), Title field, Save button, "Keep it on" Notes only / Home screen / folder.

## Done
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
- Clients/Notes/Assistant render in the window body, not the toolbar.
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
- Direct `repo.save*` in App only where `data.reload()` follows.
- A module shared by the entry and a lazy chunk lands whole in the entry:
  split cheap helpers out (`photo/neutral.ts`, `invoice/mailto.ts`,
  `lib/demoSeeded.ts`, `os/mock/names.ts`) — do not re-export them back.
- Clients/Notes wiring lives in lazy `app/PeopleTools.tsx`; the shell only
  reads profiles (follow-ups, search) and notes. Keep `buildPeople` out of
  the entry chunk. Person id = first identity key; resolve via `personFor`.
- Thumb mode never shows an original while its thumb is missing (200 full
  decodes = the stall). Blank tile until the backfill reaches it.
- Booth on-flag persists: a reload must land back in the booth, not the studio.
- Website panel only after the artist ticks "I can see my site" (no detection
  possible); otherwise the QR panel covers it.
- Booth pieces = today's show pieceIds ∪ inCurrentShow, minus hidden.
## Dead ends (do not retry)
- Two builds of one commit share `sw.js?v=` → SW never updates. Commit first.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)
0. Assistant live; owner tested note-in-folder 2026-10-08: all worked. Draft actions
   `commission_draft` / `invoice_draft` added (7 device actions; drafts only,
   price null unless said, optional folder) — check on the live site with owner.
1. Phase 3 part 2: profile video for the loop (needs a stored file → DB v8
   or the images store; test v7→v8 with an old tab open); phone dock shows
   fewer items (audit 14). Check booth likes with a real show piece (script has none).
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
- Tested: unit 701; check-assistant 19/19 (real model/studio NOT tested); `check-booth` 22/22 (tablet+phone offline: no-PIN start
  blocked, loop, sign-up stored, QR, Ctrl+K held, wrong PIN, reload stays in
  booth, PIN out). NOT: website iframe on a real site, loop with real photos,
  idle return timing by hand, full-screen on iPad.
- Earlier phases: all `scripts/check-*` pass. NOT tested: real mic, real
  vCard, device camera, merge UI by hand, dark sheets, real Mac/iPad keys,
  deployed URL (proxy 403), 861–1000px, iOS print.

## Resume
- Read `CLAUDE.md`, then only the Phase 3 section of `BUILD_PLAN.md`.
- Booth code is all in `src/booth/`; setup is Connect's "Booth mode" tab.
- Push to `main` (deploys) and to the session's `claude/*` branch if named.
- Browser checks: see `TESTING.md`.
