# Artist OS

A desktop-styled workspace for one working studio: commissions and client
updates, invoices, project folders, the artist's own pictures with a darkroom
to edit them in, a catalogue of every piece and what it sold for, the books, a
Finder, a Trash, and Connect (guest book, sharing, QR). It runs entirely in the
browser with no server, and it is honest about that everywhere it matters.

Live at **https://fineartos.bobdylan2000.workers.dev**, rebuilt about a minute
after every push to `main`.

```bash
npm install
npm run dev
```

## Starting a work session with Claude

The repo is set up so a new session costs almost nothing to start. Don't paste
summaries or explain the project — it reads that itself.

1. Go to **claude.ai/code** and start a **new session**.
2. In the repository picker, choose **`yitzhach/fineartos`**. Search
   "fineartos" if it isn't listed. Leave the branch as `main`.
3. Send one line:

   > Read HANDOFF.md and do Next #1.

   If step 2 wouldn't let you pick this repo, send instead:

   > Attach yitzhach/fineartos per HANDOFF.md, then do Next #1.

4. Give the session that one task. Don't add unrelated work to the same chat.
5. When the work is done and pushed, reply: **update the handoff**.
6. Close the chat. Start a new one for the next task, from step 1.

**Why it works this way.** Every turn re-sends the whole conversation, so a
long session costs more the longer it runs. Short sessions, one task each, with
`HANDOFF.md` carrying the baton between them, is the cheap way to work.

**If something looks off**

- No `SETUP:` lines at the start? The start-up hook didn't run — say
  `run .claude/hooks/session-start.sh`.
- Summarizing instead of working? Say `skip the recap, execute Next #1`.

## The documents

- **[HANDOFF.md](HANDOFF.md)** — current state and what to do next. Small,
  rewritten every session.
- **[CLAUDE.md](CLAUDE.md)** — the standing rules: constraints, the
  non-negotiables, commands, gotchas, and the handoff contract.
- **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)** — the fuller architecture guide.
  Predates Finance; not fully current.
- **[BUILD_PLAN.md](BUILD_PLAN.md)** — the audit and the phased build list.
  Each work session takes the next one or two phases.
- **[FUTURE_BUILD.md](FUTURE_BUILD.md)** — what is deliberately not built, and
  why. `COMMISSION_PHASE_1.md` is the original brief.
