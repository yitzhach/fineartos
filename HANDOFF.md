# HANDOFF — baton only. Rules and commands live in `CLAUDE.md`.
## Goal
- Artist OS: desktop-OS business suite for one artist. Browser-only, local-first.
- Build `BUILD_PLAN.md` phase by phase. Phases 0–6 done (2026-10-09).
## Now
- `main` live at 1282cb5: viewing links + link list (778 unit, 53 qa live).
- First-load JS 95.5 KB gzip of a 100 KB budget (was 99.3): launcher tables
  now load lazily. Keep new shell code out of the entry chunk.
- Viewing links: Send a picture › "Add a viewing link" (signed in) → R2
  `fineartos-shares` via `worker/share.ts`; client opens `/p/<id>`, 90 days.
  All mailto buttons open in a new tab (webmail used to replace the app).
- Phase 7 (sync through studio-api, billing) needs owner calls; not started.
- Every change follows CLAUDE.md "Site QA workflow".
## Done
- Phases 0–6: see `BUILD_PLAN.md`. Studio sign-in + assistant: `src/studio/`.
## Decisions (keep)
- Calendar maths runs in the lazy chunk: App only gathers `calendarInput`.
- Board stage is derived, never stored; a draft is Quoting whatever it holds.
- Commission tasks are private; `toClientFacing` names its fields — keep it so.
- Mailing list is derived, never stored; consent never assumed (`mayEmail: true`).
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
- Viewing links: owner checked against studio-api `/v1/me` (cookie); link page
  is server HTML with strict CSP, no app shell; sw.js skips `/share/`, `/p/`.
  Expired / removed / made-up ids all answer the same 404 page.
- Uploads are re-drawn as JPEG ≤2400px client-side: strips GPS metadata.
- "Your viewing links" list (Send a picture) reads `owners/<owner>/<id>`
  markers; links made before 2026-10-10 have none and never list. Expired R2
  objects stay (add lifecycle rule on `shares/` if storage ever matters).
## Dead ends (do not retry)
- tabs.spec: `waitForLoadState('networkidle')` after a Finance tab click hangs
  60 s though the tab makes 0 requests. Use a fixed wait.
- Two builds of one commit share `sw.js?v=` → SW never updates. Commit first.
- `check-lazy-thumbs` stall check (<500 ms) is noisy: old and new builds both
  420–630 ms here. Compare interleaved runs, never one.
- `pkill -f "vite preview"` kills the shell (exit 144): run it alone.
## Next (numbered)
1. Owner tests viewing link live: sign in (Assistant), Connect › Send a
   picture › Add a viewing link › Email; open link on a phone; Remove from
   "Your viewing links". Then Next #2.
2. Phase 7 plan only: write `docs/phase-7.md` (records → studio-api sync,
   conflicts shown never overwritten, Trash sync per `FUTURE_BUILD.md`).
   Owner questions first: billing/plans (CLAUDE.md: nothing may imply it
   yet), which records sync, new Worker routes need Art-Talk-Back to ship
   first. Build nothing server-side without Isaac's yes.
3. Owner checks, NOT tested: calendar .ics import on iPhone/Android; real
   print output (labels, COA, iOS print); CSV import to Mailchimp/Kit/
   Buttondown; BCC draft in iOS Mail; pay/show QR scanned by a phone;
   selling + Visualizer on a tablet; booth likes; loop video on devices;
   search box on a slow phone (brief "Loading search…" before idle load).
## Files (path — why)
- `qa/` — site-qa kit; ours: `site.config.ts`, `audit-baseline.json`,
  `tests/site/` windows.spec (dock apps), tabs.spec, startup.spec, windows-known.json.
- `src/os/goKeys.ts`, `src/os/launcher.ts` — entry vs lazy launcher split.
- `src/App.tsx` — wiring, `renderContent`, `openDated`, `calendarInput`.
- `src/app/lazyTools.tsx` — every lazy window; add new tools here.
- `src/share/viewLink.ts` (rules + client page), `src/share/upload.ts`,
  `worker/share.ts`; `scripts/check-share.mjs` (16, wrangler dev + fake api).
- `src/calendar/`, `src/commission/tasks.ts` — Phase 6.
- `src/connect/`, `src/shows/selling.ts`, `src/visualizer/` — Phases 4–5.
- `scripts/check-calendar.mjs` (34), `check-mailing.mjs` (24),
  `check-selling.mjs` (42), `check-visualizer.mjs` (30, `ROOM=` a photo),
  `check-booth.mjs` (22), `check-shows-trash.mjs`, `check-lazy-thumbs.mjs`.
## Verify (tested / NOT tested)
- Tested 2026-10-10 viewing links + list: unit 778; qa 53 local+live; check-share 16.
  NOT tested: live upload with real studio-api session; phone mail apps.
- Tested 2026-10-09 (site-qa + 4 fixes, live 63908ce): unit 763; qa 41 local
  + live; startup.spec fails 3/3 on old build; check-calendar 34/34; CI green.
- NOT tested: anything on a real device; .ics in a phone calendar; printed
  paper; newsletter-tool imports.
## Resume
- Read `CLAUDE.md`, then this file. Execute Next #1.
- Browser checks: `npm run build`, then `node scripts/check-*.mjs` (see
  `TESTING.md`). Write output to a file; never verify through a pipe.
- `main` = deploy (~1 min); land there only on owner's word.
