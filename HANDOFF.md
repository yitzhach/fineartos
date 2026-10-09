# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.
## Goal
- Artist OS: desktop-OS business suite for one artist. Browser-only, local-first.
- Build `BUILD_PLAN.md` phase by phase. Phases 0–6 done (2026-10-09).
## Now
- `main` green at the commit that wrote this: 762 unit tests, IndexedDB v8.
- First-load JS 95.5 KB gzip of a 100 KB budget (was 99.3): launcher tables
  now load lazily. Keep new shell code out of the entry chunk.
- Phase 7 (sync through studio-api, billing) needs owner calls; not started.
## Done
- Entry diet: `os/goKeys.ts` (GO_KEYS, goStep) stays in the entry;
  `os/launcher.ts` (tools, actions, records, ranking) is its own 4.6 KB chunk
  loaded on idle (≤2 s) or when the box opens. `useLauncher` in
  `app/useShellKeys.ts` → `LauncherState` loading / failed (Reload) / ready.
- Phase 6 calendar + tasks: `calendar/calendar.ts` (every dated thing once:
  shows, deadlines, deliveries, milestones, tasks, payments due, follow-ups;
  month grid, ICS with folding + exclusive DTEND; tested). Lazy
  `calendar/ui/CalendarWindow` — Month / List / Board, kind filters, .ics.
  `commission/tasks.ts`: private `doc.tasks` (not in `toClientFacing`), board
  stage read from state+money+milestones. ProjectWindow → Tasks tab. G K.
- Phase 5 mailing list: `connect/mailing.ts` (derived, never stored; consent
  never assumed; clients need `mayEmail: true`). Connect → Mailing list tab;
  Show → Export sign-ups (one tap); QR "For a show" adds utm_* tags.
- Phase 4: Visualizer (`visualizer/`); selling at a show (`shows/selling.ts`:
  two-tap sale, tally, receipt hand-off, sale → Trash kind `sale`); pay QR;
  show take % → sale fee; prints (`shows/prints.ts`, hidden-iframe print).
- Phases 0–3: see `BUILD_PLAN.md`. Studio sign-in + assistant exist
  (`src/studio/`, Art-Talk-Back D-078/D-079/D-080).
## Decisions (keep)
- Calendar maths runs in the lazy chunk: App only gathers `calendarInput`.
- Board stage is derived, never stored; a draft is Quoting whatever it holds.
- Commission tasks are private; `toClientFacing` names its fields — keep it so.
- Mailing list: latest guest answer per address wins; client No removes.
- Trashed sale lives on the piece (`photo.trashedSales`); Put back refuses if
  resold since. Only show sales (`id`+`before`) are trashable.
- `shows/selling` dynamic-imported from App + useTrash (entry budget).
- Visualizer room photo = window state only; piece drawn from thumbnail.
- `/v1/*`, `/assistant/*` never cached by `sw.js` (live sign-in data).
- Note in a folder = `pin {kind:'project'}`. No DB bump.
- System bar search is the launcher; actions only when runnable (rule 8).
- Launcher box draws at once; only its tables are lazy. G keys never wait.
  Don't re-export goKeys from launcher.ts (would pull tables into entry).
- Emptying the Trash reloads BEFORE entries leave it (else a flash-back).
- Shared modules: split cheap helpers out of the entry chunk; don't re-export.
- Clients/Notes wiring in lazy `app/PeopleTools.tsx`; keep `buildPeople` out
  of the entry chunk.
- Thumb mode never shows an original while its thumb is missing.
- Booth on-flag persists across reload; guest book 5 s quiet → loop, no PIN.
- Free = runs on device; paid = costs money. No plan shown before billing.
## Dead ends (do not retry)
- Two builds of one commit share `sw.js?v=` → SW never updates. Commit first.
- `check-lazy-thumbs` stall check (<500 ms) is noisy: old and new builds both
  420–630 ms here. Compare interleaved runs, never one.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.
- Rendering the launcher lazily to "save" bytes is cheating: it draws at once.
## Next (numbered)
1. Phase 7 plan only: write `docs/phase-7.md` (records → studio-api sync,
   conflicts shown never overwritten, Trash sync per `FUTURE_BUILD.md`).
   Owner questions first: billing/plans (CLAUDE.md: nothing may imply it
   yet), which records sync, new Worker routes need Art-Talk-Back to ship
   first. Build nothing server-side without Isaac's yes.
2. Owner checks, NOT tested: calendar .ics import on iPhone/Android; real
   print output (labels, COA, iOS print); CSV import to Mailchimp/Kit/
   Buttondown; BCC draft in iOS Mail; pay/show QR scanned by a phone;
   selling + Visualizer on a tablet; booth likes; loop video on devices;
   search box on a slow phone (brief "Loading search…" before idle load).
## Files (path — why)
- `src/os/goKeys.ts`, `src/os/launcher.ts` — entry vs lazy launcher split.
- `src/App.tsx` — wiring, `renderContent`, `openDated`, `calendarInput`.
- `src/app/lazyTools.tsx` — every lazy window; add new tools here.
- `src/calendar/`, `src/commission/tasks.ts` — Phase 6.
- `src/connect/mailing.ts`, `src/connect/ui/MailingList.tsx` — Phase 5.
- `src/shows/selling.ts`, `src/shows/prints.ts`, `src/visualizer/` — Phase 4.
- `src/studio/` — sign-in hint + assistant (platform side in Art-Talk-Back).
- `scripts/check-calendar.mjs` (34), `check-mailing.mjs` (24),
  `check-selling.mjs` (42), `check-visualizer.mjs` (30, `ROOM=` a photo),
  `check-booth.mjs` (22), `check-shows-trash.mjs`, `check-lazy-thumbs.mjs`.
## Verify (tested / NOT tested)
- Tested 2026-10-09 (launcher split): unit 762; check-launcher-tiling 20/20;
  check-lazy-thumbs 15/15 (95.5 KB). Launcher "failed" state NOT exercised.
- Tested 2026-10-09: unit 762; check-calendar 34/34, check-mailing 24/24,
  check-selling 42/42, check-booth 22/22, check-shows-trash ok,
  check-lazy-thumbs all pass (99.3 KB). All desktop + phone, 2nd tab open.
- NOT tested: anything on a real device; .ics in a phone calendar; printed
  paper; newsletter-tool imports; deployed URL (proxy 403 from sandbox).
## Resume
- Read `CLAUDE.md`, then this file. Execute Next #1.
- Browser checks: `npm run build`, then `node scripts/check-*.mjs` (see
  `TESTING.md`). Write output to a file; never verify through a pipe.
- Push to `main` = deploy (~1 min).
