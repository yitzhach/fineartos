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
of twenty apps: commissions and their client updates, invoices, project
folders, the artist's own pictures with a darkroom to edit them in, a
catalogue of every piece and what it sold for, the books, a Finder, a Trash,
and Connect (guest book, sharing, QR). It runs entirely in the browser with
no server, and it is honest about that everywhere it matters.

Built tools in the dock: New, Home, Projects, Invoices, Finder, Connect,
**Artwork**, **Finance**, Trash. Still placeholders, subdued and opening
nothing: **Shows** and **Visualizer**.

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
| `src/finance/ledger.ts` | The books: what was spent, and what a total could not see |
| `src/finance/owed.ts` | What is still owed, and what is left out of that total |
| `src/finance/statement.ts` | The profit and loss page an accountant is handed |
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
   A client update records that the artist *handed it over*, never that it
   arrived, and an unanswered one says "No reply recorded", never "pending".
5. **Never leave a failure silent.** See the hang below.
6. **A total says what it could not see.** An amount nobody recorded is null,
   never zero, and every figure is followed by how many rows were left out of
   it — on screen, as a blank cell in a CSV, and at the foot of the profit
   and loss. A number that is wrong on a tax return is worse than one that is
   missing.
7. **Nothing here is tax advice.** The word "deductible" does not appear in
   the app. Categorising a row is bookkeeping; what it means on a return is
   the accountant's to say, and the statement says so itself.
8. **A dead control is worse than none.** No mileage rate ships with the app
   (it changes yearly and by country), the dictation microphone is absent
   where the browser cannot listen, and the client page drops its Approve
   button when there is no studio address for it to write to.
9. **An edit never writes over the photograph.** The darkroom keeps the
   original beside the picture and stores the numbers that made it, so an
   edit can be reopened, changed or undone, and is never applied twice.

## The bug worth knowing about

Adding the `photos` store took IndexedDB to version 3. (It is version 5 now —
4 added client updates, 5 added the books. Every upgrade adds a shelf and
touches nothing already on the others, and every one is checked with a second
tab open, which is exactly how version 3 hung.) A browser will not
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
npm test               # 504 tests
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

The tree is green and deployed. Nothing is half-finished except the three
small things at the top of this list, which are leftovers from work that
otherwise landed.

**Small, and owed:**

1. **A PDF option for a client update.** The agreed set was JPEG by default
   with PDF and HTML alongside; JPEG, the self-contained page, Share and Copy
   shipped and PDF did not. The channel already exists in the model
   (`HandoffChannel = 'pdf'`) with nothing using it.
2. **Deleting a commission forever leaves its updates behind.** Emptying the
   Trash removes the document, its invoices and its pictures, but not the
   `clientUpdates` rows, which then sit unreferenced.
3. **Export and import do not carry updates or expenses.**
   `src/persistence/portable.ts` predates both.

**Next, in the order they were talked about:**

4. **An update from a milestone** — ticking a stage offers to tell the
   client. It was in the design and was not built.
5. **Client status on a commission's Overview tab** — last update, anything
   unanswered — so the Client tab does not have to be opened to know.
6. **Shows**, the fourth tool. Paused deliberately. When it comes back the
   scope to settle is: name, venue, dates, booth fee, deadline and status,
   plus which pieces went and the guest entries collected there. Artwork owns
   the piece and where it is; Shows owns the event; Finance reads both. Build
   them in another order and they will collide.
7. **Visualizer**, the last placeholder. No design yet.

**The gate on everything else:** sign-in. Cloud saving, the guest book
online, real email, Square, and the version of the client page that can
*receive* an approval instead of composing one are all behind it. The
dependency chain and the decisions each step needs are written out in
`FUTURE_BUILD.md`.

## What was built in the session that wrote this

For context on why the code looks the way it does, newest first:

- **Payment due** — a Finance tab listing invoices with a balance and
  commissions issued but never invoiced, each row opening the record it stands
  for, and the invoice rows on Money in made clickable the same way. Nothing
  is stored: `src/finance/owed.ts` reads the records that already exist.
- **Finance** (`696d451`) — the books: money in from invoice payments and
  piece sales kept apart, money out with receipts and mileage, a profit and
  loss page on the studio's letterhead, three CSVs, and dictation.
- **Desktop overlap** (`ff9c25b`) — icons were 123px in a 116px cell, the
  collision checks compared positions exactly, and shrinking the window piled
  a column onto one row. All three fixed; nothing overlaps now.
- **Artwork** (`a75c973`) — the catalogue: a wall, a list edited in place, a
  sales ledger, CSVs, and a client view that shows prices but never what
  something sold for.
- **Client updates** (`e7d8344`) — updates and replies as child records of a
  commission, with a timeline built from the records rather than kept as its
  own log.
- **The darkroom** (`9832f71`, `edbc3f7`, `a90cf53`, `994d9f8`, `b39fd0e`) —
  preview and fullscreen, tone and colour with eight hue bands, crop and
  straighten, non-destructive re-editing, a phone-first tool-group layout,
  and the two-speed rendering that made it keep up with a slider.
- **Window tabs** (`767a8ca`, `d86f34a`) — merge windows into tabs, drag one
  onto another, and the desk remembers itself across a reload.
