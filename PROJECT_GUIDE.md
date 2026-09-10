# Artist OS — project guide

One desktop-style workspace containing one working tool: **Commission
Documents**. An artist can create a commission document, save it, reopen it,
edit it and print a polished client PDF, with or without a network.

This is the single guide for the project. `COMMISSION_PHASE_1.md` is the
original brief and is kept for reference.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build into dist/
npm run preview      # serve the built app (needed for the service worker)
npm test             # unit tests
npm run typecheck
```

Acceptance run in a real browser (screenshots and PDFs):

```bash
npm run build && npm run preview -- --port 4180 &
ACCEPTANCE_OUT=acceptance-output npm run acceptance
```

Set `PLAYWRIGHT_CHROMIUM=/path/to/chrome` if Playwright's bundled browser is
not where it expects.

## What exists

| Area | Where | Notes |
| --- | --- | --- |
| OS shell | `src/os/` | System bar, dock, one draggable document window |
| Module registry | `src/os/registry.ts` | Future tools register name, icon, entry point |
| Commission model | `src/commission/types.ts` | Money is integer minor units throughout |
| Calculations | `src/commission/calc.ts` | The one shared calculation function |
| Lifecycle | `src/commission/document.ts` | Create, duplicate, issue, revise |
| Editor / list / client preview | `src/commission/ui/` | The three views |
| Storage | `src/persistence/` | IndexedDB, queue, export/import, cloud adapter |
| Print | `src/print.css` | Letter and A4, no app chrome |
| Offline | `public/sw.js`, `public/manifest.webmanifest` | Installable PWA |

## Decisions, and why

**Money is integer minor units.** Cents, never floats. Rounding is half-up and
happens exactly once per derived figure, in `calc.ts`. Every total anywhere in
the app — editor, list, preview, print — comes from `calculateTotals`, so two
screens cannot disagree.

**An unknown is null, not zero.** No configured tax rate means the document
says tax was not applied; it does not print `$0.00`, which would be a claim
about the world. A rate the artist typed as `0` does mean zero. Same for
deposits and dimensions.

**A deposit requested is not money received.** They are separate figures and
separate lines, on screen and in print. Overpayment surfaces as an explicit
credit rather than only as a negative balance.

**Private notes cannot reach the client.** `toClientFacing` is an allowlist,
and `ClientPreview` is typed to accept only `ClientFacing`. A field added to
the model is excluded by default rather than included by default. A test
asserts the notes appear in no snapshot, export or preview.

**Issuing freezes a copy.** An issued document keeps an immutable
client-facing snapshot with a version number. A later edit opens a new draft
revision at the next version and leaves the snapshot untouched, so what the
client was given stays what the client was given.

**Duplicating starts a new commission.** New id, new document number, no
payments, no issued history — it copies the work, not the money.

**Connectivity is not sync.** Save states are `Saved on this device`,
`Saved on this device · pending sync`, `Synced` and `Save failed`. Only a
cloud adapter's confirmed write reaches `Synced`. Nothing claims otherwise.

**Conflicts are preserved, not resolved.** A remote version that disagrees is
stored beside the local one and shown to the artist. Neither copy is
discarded.

**No background sync.** The queue drains when the app is open and online,
because a browser makes no promise to run anything while it is closed. Queued
writes carry stable ids derived from workspace, operation and target, so a
replay replaces rather than duplicates.

**Browser storage is not a backup, and the app does not pretend it is.**
JSON export/import exists for portable recovery. The export states outright
that images are not in the file and lists the image ids a document expects;
import validates every field, reports all problems at once, and refuses a bad
file whole.

**Workspace scoping is in the storage layer, not the UI.** Every read goes
through `Repository`, which is constructed with a workspace id and treats a
row from another workspace as absent. Adding sign-in later does not mean
revisiting storage.

**The wallpaper is a CSS treatment, not an image.** It works offline, ships no
asset, and is never the design screenshot. A solid background is one click
away in the system bar.

## Where this lives

| | |
| --- | --- |
| Primary repo | `yitzhach/fineartos` (public), branch `main` — this is what deploys |
| Mirror | `yitzhach/commission` (private), branch `claude/commissions-repo-setup-imhxss` — same code, where the build started |
| Cloudflare Worker | `fineartos` |
| URL | https://fineartos.bobdylan2000.workers.dev |

**Do not deploy over the Worker named `commission`.** It is a separate,
pre-existing Worker in the same account and is not part of this project.

## Deploying

Cloudflare Workers Builds is connected to `yitzhach/fineartos` and deploys
`main` on push. The app is static assets only — no server in the read path.

Required Cloudflare build setting:

| Setting | Value |
| --- | --- |
| Deploy command | `npm run deploy` |
| Branch | `main` |

`npm run deploy` is `npm run build && wrangler deploy`. This matters: a deploy
command of plain `npx wrangler deploy` fails with *"The directory specified by
the assets.directory field does not exist"*, because nothing built `dist/`
first.

`wrangler.jsonc` carries the rest, including `workers_dev: true`. Without that
the deploy succeeds but the URL does not resolve at all, which reads as a
broken build when the build is fine. Keep it in the config rather than relying
on the dashboard toggle.

Deploy by hand from a machine that is logged in:

```bash
npx wrangler deploy --dry-run   # validates config, no auth needed
npm run deploy
```

### Deployment history, and what is unverified

The first Git build failed twice, for two different reasons: the repo was
still empty when Cloudflare first cloned it, then the deploy command ran
wrangler without building. Both are fixed.

**Whether the site currently serves correctly has not been confirmed by
anyone.** The agent session that built this could not reach `*.workers.dev` —
the sandbox network policy answers 403 to the CONNECT, which surfaces as
`HTTP 000` and is not evidence about the site either way. The Cloudflare API
did show the Worker modified at 2026-09-10 19:45 UTC, after the fixes, which
is consistent with a successful deploy but does not prove the page renders.

First job in a new session: open the URL in a real browser and confirm what
loads.

## Blockers and what is not verified

**Cloud sync is not configured, and is therefore unverified.** No Supabase or
R2 credentials exist for this project. The only adapter that ships is
`unavailableCloud` (`src/persistence/sync.ts`), which reports itself
unconfigured; the app displays that verbatim and stores everything locally.

The queue drainer, conflict handling and save states are real and tested
against fake adapters, and work unchanged once a configured adapter is
supplied. To configure one, implement `CloudAdapter` and pass it in place of
`unavailableCloud` in `src/App.tsx`.

**Because there is no cloud, tenant isolation between two real workspaces is
unverified.** Local workspace scoping is enforced and tested. Server-side
isolation — row-level security on every record and image operation, secrets
kept server-side, image type and size validated at the server — is not, and
must be before anything is called production-ready.

**The repository had no Cloudflare Worker.** The brief said `main` connects to
one. It does not: at the starting commit the repository contained only
`README.md` and `COMMISSION_PHASE_1.md`. Nothing was migrated or displaced.

**The live deployment is unconfirmed.** See "Deployment history" above.

**The Artist OS design reference image was not available** in the build
session. The visual direction follows the written description in the brief.

## Next phase

In the brief's order: show preparation and a protected client kiosk with
offline inquiry capture; then the full commission workflow (site visits,
concepts, production, delivery, archive); then secure client links,
version-specific approvals and payment integration.

Nothing in this build implies any of it exists. Unbuilt tools appear in the
dock subdued and labelled "Coming later", and open nothing. There is no
billing, no plan, and no sign-up anywhere in the project.
