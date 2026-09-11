# Artist OS — project guide

One desktop-style workspace for running an art business. Two working tools:
**Commission Documents** and **Invoices**. An artist can create a commission,
file it into a project folder on the desktop, bill it with one or more
invoices, and hand the client a polished PDF, JPEG or self-contained HTML
file — with or without a network.

`FUTURE_BUILD.md` records the three requested features that need a backend
(emailing from the app, Square integration, the client portal) and what each
would actually cost. None of them is built, and nothing in the app implies
they exist.

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
| OS shell | `src/os/` | System bar, magnifying dock, one draggable window, desktop, settings |
| Commission overview | `src/commission/ui/Overview.tsx` | The at-a-glance screen: stats, facts, money, activity, next step |
| Demo record | `src/lib/demo.ts` | Seeded once on a first run, labelled, removable |
| Desktop icons | `src/os/Desktop.tsx` | Click selects, double-click opens. Thumbnails from the first reference image |
| Drag-and-drop images | `src/os/ImageDrop.tsx` | One well used for references, the logo and the wallpaper |
| Project folders | `src/project/` | A real record holding document and invoice ids |
| Invoices | `src/invoice/` | Child records of a commission; many per project |
| Invoice output | `src/invoice/render.ts` | Self-contained HTML and a canvas drawing, both from the model |
| Wallpapers | `public/wallpapers/` | Three SVGs, ~2KB each, precached by the service worker |
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

**The app opens into work, not an empty desktop.** A first run seeds one
commission marked `isDemo`, with its artwork drawn on a canvas rather than
shipped as a stock photograph. It is labelled DEMO wherever it appears and
removable in a click; the seeded flag means it stays removed. Later launches
reopen whatever was touched last. The desktop stays visible behind the window
rather than being a screen you navigate away from.

**The overview invents nothing.** Its activity list is read off timestamps the
record already carries — there is no activity log in the app — and the "next
step" is worked out from what is genuinely missing. A dashboard that shows
made-up numbers is worse than no dashboard, because it is believed.

**The wallpaper is a bundled SVG, or the artist's own image.** Four ship with
the app — Obsidian (the default), Studio Plaster, Dusk and Linen — drawn as SVG rather than photographs
so they are about 2KB each, sharp at any resolution, and precached for offline.
The artist can drop in their own photo instead; it lives in IndexedDB like every
other image, and only its id is in localStorage. A solid background is still one
click away. On a first run the default follows the theme, because a dark
wallpaper under a light system bar reads as a bug rather than a choice.

**An invoice is a child record, never a mode of a commission.** Generating one
copies the client, the lines and the payment details as they stand at that
moment. Editing the commission afterwards cannot reach back into an invoice
the client already has — the same rule issuing already applied to terms,
applied to money. A project can hold as many invoices as it needs, which is
how a deposit invoice and a final invoice come off one commission.

**Payment details are text the artist typed.** A Square link is a link they
pasted from their own Square dashboard; the client pays Square directly and
Artist OS never sees the money. The invoice prints only the methods actually
filled in, and says plainly when none are.

**A folder is a container, and emptying it is not deleting.** Taking an item
out of a project folder puts it back on the desktop. Deleting the folder
leaves everything that was inside it alone.

**Exports are rendered from the model, not screenshotted.** The HTML file and
the JPEG are two renderers over the same `Totals`, so neither can disagree
with the editor, and neither can accidentally capture app chrome or a
half-scrolled window.

## Where this lives

| | |
| --- | --- |
| Primary repo | `yitzhach/fineartos` (public), branch `main` — this is what deploys |
| Baseline | `yitzhach/commission` (private), branch `claude/commissions-repo-setup-imhxss` — frozen on purpose, see below |
| Cloudflare Worker | `fineartos` |
| URL | https://fineartos.bobdylan2000.workers.dev |

**Do not deploy over the Worker named `commission`.** It is a separate,
pre-existing Worker in the same account and is not part of this project.

**Leave the `commission` repo behind on purpose.** It holds this app as it
stood at the first three commits and is kept as a fixed point for A/B
comparison and testing against `fineartos`. It will drift further behind, and
that is the point — do not sync, rebase or "catch it up". Comparing the two
is only meaningful while one of them stops moving.

## Deploying

Cloudflare Workers Builds is connected to `yitzhach/fineartos` and deploys
`main` on push. The app is static assets only — no server in the read path.

The build now lives in `wrangler.jsonc` as a custom build command:

```jsonc
"build": { "command": "npm run build" }
```

This matters more than it looks. Workers Builds does not run npm scripts — it
invokes wrangler directly, and which command it uses depends on the branch:

| Branch | Command Cloudflare runs | Effect |
| --- | --- | --- |
| Production (`main`) | `wrangler deploy` | Uploads a version **and releases it** |
| Any other branch | `wrangler versions upload` | Uploads a version, releases nothing |

Neither builds anything on its own. Twice now a build has failed with *"the
directory specified by the assets.directory field does not exist"* because
wrangler ran before anything produced `dist/`. With the build in the config,
any wrangler command builds first, and no dashboard setting can lose it.

There is a second safety net in `package.json`:

```json
"postinstall": "npm run build"
```

Cloudflare always runs `npm clean-install`, and npm always runs `postinstall`
after it. So `dist/` exists before wrangler is invoked at all, whatever
command the dashboard is set to. Belt and braces, because this specific
failure has now cost three builds. The cost is that a local `npm install`
also builds; that is a second or two, and worth it.

**Retrying a failed build re-runs the old commit.** A fix pushed after the
failure is not in it. Push a new commit, or trigger a fresh build on the
branch head — do not hit Retry and conclude the fix did not work.

The branch/command distinction above is worth remembering when a push to a
branch appears to "deploy" and the live URL does not change: that is correct
behaviour, not a failure. Only `main` releases.

`workers_dev: true` is the other load-bearing line: without it the deploy
succeeds but the URL does not resolve at all.

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

**The live deployment is still unconfirmed from inside an agent session.**
Two sessions in a row have been unable to reach `*.workers.dev` — the sandbox
network policy answers 403 to the CONNECT, which is not evidence about the
site either way. What *has* been verified: the Worker exists and was modified
45 seconds after the last push, `workers_dev: true` is in `wrangler.jsonc`,
and the exact `dist/` that deploys renders correctly in a real Chromium with
zero console errors. If the URL is broken it is hosting configuration, not the
app. Someone outside the sandbox still needs to open it.

**The Artist OS design reference image was not available** in the build
session. The visual direction follows the written description in the brief.

## What is not built, and says so

- **No email is sent from the app.** The invoice offers a `mailto:` link that
  opens the artist's own mail client with the client and subject filled in;
  the file is attached by the artist. The preview says this outright.
- **No payment is processed.** See `FUTURE_BUILD.md`.
- **No client portal.** See `FUTURE_BUILD.md`.
- **Dragging an icon into a folder** is not wired up; filing happens through
  the Save button and the folder window.

## Next phase

In the brief's order: show preparation and a protected client kiosk with
offline inquiry capture; then the full commission workflow (site visits,
concepts, production, delivery, archive); then secure client links,
version-specific approvals and payment integration.

Nothing in this build implies any of it exists. Unbuilt tools appear in the
dock subdued and labelled "Coming later", and open nothing. There is no
billing, no plan, and no sign-up anywhere in the project.
