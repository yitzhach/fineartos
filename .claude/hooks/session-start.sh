#!/bin/bash
# Boots this repo so a session starts knowing where it stands, without
# spending any of the model's tokens finding out. Keep the output to a few
# lines: everything printed here lands in the session's context.
set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

if [ ! -d node_modules ]; then
  # postinstall runs the build, which also typechecks.
  npm install --no-audit --no-fund >/tmp/fineartos-install.log 2>&1 \
    || { echo "SETUP: npm install FAILED — see /tmp/fineartos-install.log"; exit 0; }
fi

if npm test >/tmp/fineartos-test.log 2>&1; then
  echo "SETUP: deps ready · $(grep -oE 'Tests +[0-9]+ passed' /tmp/fineartos-test.log | tail -1) · tree GREEN"
else
  echo "SETUP: tests FAILING — read /tmp/fineartos-test.log before starting. Tree is RED."
fi
echo "SETUP: branch $(git rev-parse --abbrev-ref HEAD) at $(git rev-parse --short HEAD). Read HANDOFF.md, then do Next #1."
