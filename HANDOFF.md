# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Build `BUILD_PLAN.md` phase by phase.

## Now

- Tree green, 671 tests, IndexedDB v7. Phases 1 and 2 done. Phase 3 next.
- First-load JS 98.7 KB gzip (terser). ~1 KB headroom: new code goes lazy.

## Done

- Phase 0 (search box, tiling), Phase 1 part 1 (hooks in `src/app/`,
  one-record saves, startup restore, key names + `?` sheet).
- Phase 1 part 2: `app/lazyTools.tsx` (tools lazy, warm-up 3 s after load,
  "could not load" + Reload, `isLoadFailure` message). Thumbnails in
  `StoredImage.thumb` (null = cannot make), backfilled by `useObjectUrls`
  (per-id patch, 2 at a time); originals only where shown full.
- Phase 2: v7 stores guests/notes/clients/contacts (`persistence/db.ts`).
  Guest book copied from localStorage on load, old key moved to
  `artistOS.guestBook.movedToDatabase`; write failures shown. Clients
  (`clients/clients.ts`) built from commissions, invoices, guests, imported
  contacts; auto-joined only by email/phone, same name → offered. Profile
  keeps tags, follow-up (Coming up), note, merges, `label`. Notes
  (`notes/notes.ts`) pin to anything, go to the Trash. vCard/CSV import.
  Quick capture (phone + button, search box action). G L clients, G N notes.

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
- Updates travel with their commission's export. Books file two-way, CSV
  one-way. Payment due: invoiced commission drops out; totals per currency.
- Emptying the Trash reloads BEFORE the entries leave the Trash, else the
  destroyed records flash back for a frame.
- Direct `repo.save*` in App only where `data.reload()` follows, else stale.
- `PROJECT_GUIDE.md` predates Finance and tiling. Do not assume it is current.
- A module shared by the entry and a lazy chunk lands whole in the entry:
  split cheap helpers out (`photo/neutral.ts`, `invoice/mailto.ts`,
  `lib/demoSeeded.ts`, `os/mock/names.ts`) — do not re-export them back.
- Clients/Notes wiring lives in lazy `app/PeopleTools.tsx`; the shell only
  reads profiles (follow-ups, search) and notes. Keep `buildPeople` out of
  the entry chunk. Person id = first identity key; resolve via `personFor`.
- Thumb mode never shows an original while its thumb is missing (200 full
  decodes = the stall). Blank tile until the backfill reaches it.

## Dead ends (do not retry)

- Upgrade check with two builds of one commit: same `sw.js?v=` → SW never
  updates. Commit before building the new one. Kill stray `vite preview`.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.

## Next (numbered)

1. Phase 3 (Show mode) — read only that section of `BUILD_PLAN.md`.
2. Visualizer scope: settle with the artist before Phase 4 (asked in chat).

## Files (path — why)

- `src/app/*` — the hooks. `src/App.tsx` — wiring, `runAction`, render.
- `src/persistence/records.ts` — orders, upsert, visible lists, image key.
- `scripts/check-lazy-thumbs.mjs` — Phase 1 part 2 (size, offline, 200 photos).
- `scripts/check-clients-notes.mjs` — Phase 2; needs `OLD_DIST` (v6 build).

## Verify (tested / NOT tested)

- Tested: unit 671; `check-clients-notes` 15/15 (v6→v7 with old tab open,
  guest moved, guest+commission one person, follow-up in Coming up, note
  found after reload, note in Trash, phone quick capture); `check-lazy-thumbs`
  (size, offline, failed load, 200 photos longest task 370 ms); all older
  `scripts/check-*` pass.
- NOT tested: real microphone dictation, vCard from a real phone, camera
  capture on a device, merge UI by hand, dark-mode sheets, real Mac/iPad
  keys and drag, deployed URL (proxy 403), 861–1000px widths, iOS print. Nit: desktop buttons show faintly through tiled titlebars.

## Resume

- Read `CLAUDE.md`, then only the Phase 3 section of `BUILD_PLAN.md`.
- The SessionStart hook installs deps and runs the suite; trust its line.
- Push to `main` (deploys) and to the session's `claude/*` branch if named.
- Browser checks: see `TESTING.md`.
