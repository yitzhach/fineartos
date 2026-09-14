# HANDOFF

Baton only. Rules, constraints, commands and gotchas live in `CLAUDE.md`.

## Goal

- Artist OS: desktop-OS business suite for one artist. Browser-only, no server.
- Ship to `main`; Cloudflare rebuilds in ~1 min.

## Now

- Tree green and deployed. HEAD `bc3c67a`. 515 tests pass.
- Nothing half-finished.
- Dock built: New, Home, Projects, Invoices, Finder, Connect, Artwork,
  Finance, Trash. Placeholders: Shows, Visualizer.

## Done

- Finance gained a 5th tab, **Payment due**: invoices with a balance, plus
  commissions issued and never invoiced. Every row opens its record.
- Money in: invoice-payment rows are now links that open the invoice.
- `IncomeRow` gained `invoiceId` / `photoId`.

## Decisions (keep)

- Payment due counts nothing twice: once an invoice exists against a
  commission, the commission drops out. Only uninvoiced commissions list.
- Totals are one per currency — nothing in the app knows an exchange rate.
- Draft invoices are excluded from the due total, counted beside it, named.
  All-draft headline reads "Nothing asked for yet", never $0.00.
- A commission has terms, not a due date → `dueDate: null`, never overdue.
  An unsent draft is never overdue either.
- Payment due ignores the year selector, on purpose.
- Sale-of-a-piece rows stay plain text: no invoice behind them.
- `PROJECT_GUIDE.md` predates Finance and has no Finance section. Do not
  assume it is current.

## Dead ends (do not retry)

- Nothing found this session.

## Next (numbered)

1. Add the **PDF option for a client update**. `HandoffChannel = 'pdf'`
   already exists in the model with nothing using it; JPEG, self-contained
   page, Share and Copy shipped, PDF did not.
2. Deleting a commission forever orphans its `clientUpdates` rows. Emptying
   the Trash removes document, invoices and pictures, not those.
3. Export/import does not carry updates or expenses (`persistence/portable.ts`
   predates both).
4. Update from a milestone: ticking a stage offers to tell the client.
5. Client status on a commission's Overview tab — last update, anything
   unanswered — so the Client tab need not be opened.
6. Shows, the 4th tool. Scope to settle first: name, venue, dates, booth fee,
   deadline, status, which pieces went, guest entries collected. Artwork owns
   the piece and where it is; Shows owns the event; Finance reads both. Other
   orders collide.
7. Visualizer. No design yet.
8. Sign-in gates everything else: cloud saving, guest book online, real email,
   Square, a client page that can receive an approval. See `FUTURE_BUILD.md`.

## Files (path — why)

- `src/finance/owed.ts` — what is owed; DOM-free, tested. New this session.
- `src/finance/ui/FinanceWindow.tsx` — the 5 tabs; draws only.
- `src/finance/income.ts` / `ledger.ts` — money in, money out, tallies.
- `scripts/check-owed.mjs` — the browser check for Payment due; reusable
  pattern for the next one.
- `src/persistence/portable.ts` — Next #3 lands here.
- `src/commission/updates.ts` — Next #1, #2 and #4 all touch it.

## Verify (tested / NOT tested)

- **Tested**: 515 unit tests (11 new in `finance/__tests__/owed.test.ts`).
  Chromium against an existing database, with a second tab open, and at phone
  width: both row kinds list and open, second tab agrees, no horizontal
  overflow, no console errors.
- **NOT tested**: the overdue state in a browser (no invoice with a past due
  date was created — `.fin-late` styling unexercised). Two currencies in a
  browser. Light mode and tablet width for the new tab. Nothing tested on the
  deployed URL — local preview build only.

## Resume

- A fresh session starts in `yitzhach/newTEST`, an unrelated art show tracker.
  Attach this repo first: `add_repo(owner="yitzhach", repo="fineartos",
  access="push")`, run the clone command it returns into `/home/user/fineartos`,
  then `register_repo_root` on that directory. A branch instruction in the
  session briefing belongs to the other repo; here it is `main`.
- The SessionStart hook installs deps and runs the suite; trust its line.
- Read `CLAUDE.md`, then execute Next #1.
