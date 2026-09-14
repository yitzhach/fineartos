# Artist OS — handoff

Written to be pasted into a fresh chat so a new session can pick the work up
without re-reading everything. Read `PROJECT_GUIDE.md` next; it is the real
guide. `FUTURE_BUILD.md` records what is deliberately not built and why.

## First: attach this repository

**A fresh session does not start here.** It starts in `yitzhach/newTEST` —
an unrelated art show tracker — with GitHub access scoped to that repo only.
Reading this file means somebody already attached fineartos; if the session
cannot find it, that is the missing step, not a missing file:

```
add_repo(owner="yitzhach", repo="fineartos", access="push")
# then run the clone command add_repo hands back, into /home/user/fineartos
register_repo_root(owner="yitzhach", repo="fineartos", directory="/home/user/fineartos")
```

Work on `main` and push to `main`: Cloudflare deploys from it, and that is
where every commit in this project has gone. A branch instruction in the
session's own briefing refers to the other repository, not this one.

## What this is

A desktop-OS-styled business suite for one working artist. One place instead
of twenty apps: commissions, invoices, project folders, the artist's own
pictures, a Finder, a Trash, and Connect (guest book, sharing, QR). It runs
entirely in the browser with no server, and it is honest about that
everywhere it matters.

- **Repo**: `yitzhach/fineartos`, branch `main`.
- **Live**: https://fineartos.bobdylan2000.workers.dev — Cloudflare Workers
  static assets, rebuilt on every push to `main` (about a minute).
- **Stack**: React 18 + TypeScript (strict, `noUncheckedIndexedAccess`),
  Vite, Vitest. IndexedDB for records, localStorage for preferences only.

## Standing constraints

- **Do not touch the Worker named `commission`, and do not sync the
  `yitzhach/commission` repo.** It is a frozen A/B baseline. Reading it for
  reference is fine; its backend was already ported into `worker/` here and
  is switched off.
- **No greens as a primary colour.** Sage is for status only — a synced dot,
  a progress bar. Parchment (`--accent`) is the primary action.
- Must work on desktop, tablet and phone. Windows become full-screen sheets
  below 860px; the inspector folds away between 861 and 1180.

## How the code is arranged

The rule the whole project follows: **the maths lives in DOM-free modules
with tests, and React only draws the result.** If you are about to put a
calculation or a rule inside a component, put it in one of these instead.

| Model (tested, no DOM) | What it owns |
| --- | --- |
| `src/os/windows.ts` | Stacking, focus, minimise, zoom, tabs, dock toggling |
| `src/os/desktopLayout.ts` | Icon grid, snapping, clamping, auto-arrange, hit-testing |
| `src/os/trash.ts` | What the Trash hides, what emptying would destroy |
| `src/os/undo.ts` | The undo stack and what counts as the undo key |
| `src/photo/photo.ts` | A picture: size, price, status, current show, hiding |
| `src/artwork/catalogue.ts` | The catalogue: filters, sales, totals that admit gaps |
| `src/photo/adjust.ts` | The darkroom: tone, colour, and the eight hue bands |
| `src/photo/crop.ts` | Cropping and straightening, and what fits inside a turn |
| `src/project/project.ts` | Folders: they hold ids, never copies |
| `src/commission/calc.ts` | The one money calculation, integer minor units |
| `src/commission/updates.ts` | Client updates, replies, and the timeline they make |
| `src/invoice/invoice.ts` | Invoices as child records of a commission |
| `src/connect/guestbook.ts` | Guest entries, consent, CSV, signature paths |
| `src/connect/picker.ts` | Which pictures a visitor is shown, and which they picked |
| `src/lib/slideshow.ts` | The desktop slideshow: what plays, for how long |
| `src/connect/contact.ts` | vCard for the QR code |

`src/App.tsx` is the shell that wires them together. `src/os/icons.tsx` is
the dock's icon set — one 24×24 grid, one stroke weight.

## Rules that are not negotiable

These came from real mistakes. Breaking them has broken the app before.

1. **Unknown stays unknown.** A price that was never set is null and reads
   "Price on request" — never $0. A work that was never measured says so.
   A status is "Not said" until the artist says it.
2. **Moving to the Trash never deletes.** Emptying is the only destructive
   act, it asks twice, and the question quotes the real total (a folder
   holding nine is "delete 10 records"). It is deliberately **not** undoable.
3. **A folder looks like a folder.** What is filed inside shows when it is
   opened, never painted onto the icon.
4. **Nothing claims to have been sent.** Email and text hand off to the
   phone's own apps. The QR hands details out and cannot bring anything back.
5. **Never leave a failure silent.** See the hang below.

## The bug worth knowing about

Adding the `photos` store took IndexedDB to version 3. A browser will not
upgrade while another tab holds the old version open, and the app neither
released its connection nor noticed being blocked — so the upgrade waited
forever, every read waited behind it, and the app looked completely normal
while doing nothing at all: no records, no windows opening, uploads stuck,
no error anywhere. If anything ever looks dead again, start at
`src/persistence/db.ts`, which now has `onversionchange`, `onblocked`, and an
8-second cap that surfaces a visible, actionable message.

Lesson that keeps repeating in this codebase: **React state updaters do not
run synchronously.** Undo and the signature pad both silently did nothing
until their state was moved into a ref. Anything read back inside the same
event must be a ref.

## Working here

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 462 tests
npm run build          # typecheck + dist/
npm run preview        # serve dist on 4173
npm run wallpapers     # photographs in wallpaper-source/ → public/, resized
```

**Shipping desktop photographs.** Put the originals in `wallpaper-source/`
(gitignored) and run `npm run wallpapers`. Each becomes a 2560px WebP at
quality 0.82 — usually 250–450 KB, against 1.5–3 MB for the same picture as a
JPEG — plus a 480px thumbnail for the Settings grid, in
`public/wallpapers/photographs/`, and the list in `src/lib/photographs.ts` is
rewritten to match. Commit both and push; Cloudflare serves them as static
assets, so nothing lands in the JavaScript bundle and a picture is downloaded
only when it is picked. Keep the folder under about 8 MB: git keeps every
version of a binary forever. They are deliberately **not** in the service
worker's install list — precaching megabytes nobody has chosen would slow
every first load — and are cached on first use instead.

Browser checks run against the preview build with the pre-installed Chromium:

```js
chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
```

Scripts must sit in the repo directory to resolve `playwright`, and piping
their output through `grep` hides everything if they hang — write to a file.
Two things a browser check must always cover, because both have shipped
broken: the app starting against an **existing** database, and a **second
tab** open at the same time.

Deploy: push to `main`. A zip of `dist/` is what the artist uploads manually
when they want to skip the pipeline.

## Where to pick up

Nothing is half-finished; the tree is green and deployed. The open threads,
in the order they were asked for:

1. **Saving to Cloudflare**, and with it the guest book and a downloadable
   project (pitch-deck PDF, working archive, or printable dossier — the
   choice has not been made). All of it is blocked on sign-in; the decisions
   each one needs are written out in `FUTURE_BUILD.md`.
2. **The four preview tools** — Shows, Artwork, Visualizer, Finance. They sit
   in the dock subdued and labelled, and open nothing.
3. **Square integration** for taking payment, which needs the same gate.
