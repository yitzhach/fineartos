# CLAUDE.md — Artist OS

A desktop-OS-styled business suite for one working artist. Browser-only, no
server, honest about that everywhere it matters.

- Repo `yitzhach/fineartos`, branch `main`. Work on `main`, push to `main`.
- Live: https://fineartos.bobdylan2000.workers.dev — Cloudflare Workers static
  assets, rebuilt on every push to `main` (about a minute).
- Stack: React 18 + TypeScript (strict, `noUncheckedIndexedAccess`), Vite,
  Vitest. IndexedDB for records, localStorage for preferences only.
- `PROJECT_GUIDE.md` is the fuller guide. `FUTURE_BUILD.md` records what is
  deliberately not built and why. `HANDOFF.md` is the baton, not the guide.

## Handoff Contract

Use the repository as the durable source of truth. `HANDOFF.md` is only the
current baton between work sessions: small, current, disposable.

**Writing or updating it**

- Maximum 90 lines. Telegraphic bullets.
- No transcript, no code blocks, no pasted file contents.
- Do not repeat what the repository already shows clearly.
- Keep only current state, important decisions, dead ends, unresolved issues,
  next actions.
- Overwrite stale information rather than accumulating history.
- Preserve decisions that would otherwise be easy to reverse by accident.
- Preserve failed approaches that should not be retried.
- Next #1 is the exact action the next session executes immediately.
- Clearly distinguish tested from NOT tested.
- Do not reconstruct old history unless it is needed to understand now.
- Prefer the repository and the current HANDOFF.md over old chat history.

**Required headings**: Goal · Now · Done · Decisions (keep) · Dead ends (do
not retry) · Next (numbered) · Files (path — why) · Verify (tested / NOT
tested) · Resume (3–6 lines).

**Starting from it**: do not recap it unless asked. Execute Next #1. Inspect
files only as needed. Ask only on a genuine blocker the repository cannot
settle. Do not spend tokens rebuilding project history.

**When asked for a handoff**: update `HANDOFF.md` with deltas only, keep it
under 90 lines, then stop unless told otherwise.

**Cadence**: update the baton after every commit — a few edited lines while
the work is fresh. Never save it up for one end-of-session write-up: that is
the expensive way, and a session that dies before it loses everything.

## Working cheaply

Every turn re-sends the whole conversation, so cost grows with what the
session has accumulated, not with what it is doing now. Asking for a handoff
late in a long session pays for that whole session again.

- **Keep sessions short.** Land a feature, update the baton, start fresh.
  A new session reads 90 lines instead of replaying a hundred turns.
- **Never read a whole file into the conversation when a grep would do.** A
  600-line component opened once sits in context for every turn after it.
  Search for the symbol, read the range around it.
- **Run tests and builds so their output is short.** Pipe to a file and tail
  it; a full suite dump is pure cost.
- **Commit messages: about five lines.** What changed, and any decision that
  would otherwise be easy to reverse. The diff is the record; no essays.
- **Do not recap in chat what the files already say.**

The SessionStart hook (`.claude/hooks/session-start.sh`) installs and runs the
suite automatically, so a session opens already knowing the tree is green.
Trust its line; do not re-run the suite to confirm it.

## Standing constraints

- **Do not touch the Worker named `commission`, and do not sync the
  `yitzhach/commission` repo.** Frozen A/B baseline. Reading it is fine; its
  backend is already ported into `worker/` here and switched off.
- **No greens as a primary colour.** Sage is status only — a synced dot, a
  progress bar. Parchment (`--accent`) is the primary action.
- Desktop, tablet and phone all have to work. Windows become full-screen
  sheets below 860px; the inspector folds away between 861 and 1180.
- There is no billing and no sign-in yet. Nothing may imply either.

## The codebase rule

**Maths lives in DOM-free modules with tests; React only draws the result.**
About to put a calculation or a rule inside a component? Put it in a model
module beside its tests instead. `src/App.tsx` is the shell that wires them.

## Rules that are not negotiable

These came from real mistakes. Breaking them has broken the app before.

1. **Unknown stays unknown.** A price never set is null and reads "Price on
   request" — never $0. A status is "Not said" until the artist says it.
2. **Moving to the Trash never deletes.** Emptying is the only destructive
   act, asks twice, quotes the real total (a folder holding nine is "delete 10
   records"), and is deliberately not undoable.
3. **A folder looks like a folder.** What is filed inside shows when it is
   opened, never painted onto the icon.
4. **Nothing claims to have been sent.** Email and text hand off to the
   phone's own apps. The QR hands details out and cannot bring anything back.
   A client update records that the artist handed it over, and an unanswered
   one says "No reply recorded", never "pending".
5. **Never leave a failure silent.**
6. **A total says what it could not see.** An amount nobody recorded is null,
   never zero, and every figure is followed by how many rows were left out —
   on screen, as a blank cell in a CSV, at the foot of the profit and loss.
7. **Nothing here is tax advice.** The word "deductible" does not appear.
   Categorising a row is bookkeeping; the return is the accountant's to say.
8. **A dead control is worse than none.** No mileage rate ships with the app,
   the dictation microphone is absent where the browser cannot listen, and the
   client page drops Approve when there is no studio address to write to.
9. **An edit never writes over the photograph.** The darkroom keeps the
   original beside the picture and stores the numbers that made it, so an edit
   can be reopened, changed or undone, and is never applied twice.

## Commands

- `npm install` · `npm run dev` (5173) · `npm test` · `npm run build`
  (typecheck + dist) · `npm run preview` (4173).
- `npm run wallpapers` — photographs in `wallpaper-source/` (gitignored) →
  2560px WebP + 480px thumbnail in `public/wallpapers/photographs/`, and
  `src/lib/photographs.ts` is rewritten to match. Commit both. Keep the folder
  under ~8 MB. Deliberately not precached by the service worker.
- Browser checks run against the preview build with the pre-installed
  Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, launched
  with `--no-sandbox`. Scripts must sit in the repo to resolve `playwright`,
  and piping their output through `grep` hides everything if they hang —
  write to a file.
- Deploy: push to `main`.

## Gotchas

- **Check in a real browser before shipping**, against an **existing**
  database and with a **second tab** open. Both have shipped broken.
- IndexedDB is at version 5 (3 added photos, 4 client updates, 5 the books).
  Version 3 hung the whole app: a second tab held the old version open, the
  app neither released its connection nor noticed being blocked, and every
  read waited forever behind a silent upgrade. `src/persistence/db.ts` now has
  `onversionchange`, `onblocked` and an 8-second cap with a visible message.
  If anything ever looks dead again, start there.
- **React state updaters do not run synchronously.** Undo and the signature
  pad both silently did nothing until their state moved into a ref. Anything
  read back inside the same event must be a ref.
- A window's own frame can intercept clicks in a Playwright check. Scope the
  locator to `.frame[data-focused="true"]`, or close the covering window.

## How to report back

Short, plain, beginner-legible. Lead with what now works in one sentence. Say
what broke or was skipped — never hide it to stay short. Under ~150 words.
Detail belongs in the commit message and the docs, not the chat reply.
