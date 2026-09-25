# TESTING — read only when a change needs a browser check

## Fast checks (always)
- `npm test > $SCRATCH/t.log 2>&1; grep -E "Tests|failed" $SCRATCH/t.log`
- `npm run build > $SCRATCH/b.log 2>&1; tail -5 $SCRATCH/b.log` — typecheck + dist.

## Browser check
- `npm run build`, then `npm run preview` in the background (port 4173).
- Script must sit in the repo (to resolve `playwright`); delete it after, or
  keep it in `scripts/check-*.mjs` if worth rerunning.
- Launch: `chromium.launch({ executablePath:
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })`.
- Collect `pageerror` events and print them; screenshot to scratch, then view it.
- Wrap in `timeout 60 node …` and write output to a file — never pipe to grep.
- Scope clicks to `.frame[data-focused="true"]`; a window frame can cover them.
- The demo record opens on first load; its Overview is the quickest target.

## What "checked" means before shipping
- Against an existing database: reload after creating data, not only fresh.
- With a second tab open (IndexedDB upgrades have hung the app before).
- At phone width (<860px, windows become sheets) as well as desktop.
- Say in HANDOFF which of these were NOT done.

## Traps
- `pkill -f "vite preview"` inside a compound command killed the shell
  (exit 144) and skipped the rest. Stop preview in its own command.
- Full `scripts/acceptance.mjs` run: preview on 4180, `PLAYWRIGHT_CHROMIUM` set.
