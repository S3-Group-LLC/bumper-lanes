#!/usr/bin/env bash
# Bumper Lanes setup: installs everything your project needs, up front.
#
# Cloud agents may lose internet access once they start working, so this
# script installs all dependencies at the very start of a session.
#
#   Claude Code (claude.ai/code): runs automatically. .claude/settings.json
#     calls it when a cloud session starts. Nothing to configure.
#   Codex (chatgpt.com/codex): paste this line into your environment's
#     "Setup script" box (and "Maintenance script" box):
#         bash scripts/setup.sh
#
# Safe to run any time: it only re-installs when package-lock.json changed.
set -euo pipefail

# Claude Code also runs this hook outside the cloud; only install in the cloud.
if [ "${1:-}" = "--cloud-only" ] && [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$(dirname "$0")/.."

say() { printf '[setup] %s\n' "$*"; }

node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 9) ? 0 : 1)'
}

# 1. Node.js 20.9 or newer (Next.js needs it).
if ! node_ok; then
  for dir in /opt/node22/bin /opt/node20/bin; do
    if [ -x "$dir/node" ]; then export PATH="$dir:$PATH"; break; fi
  done
fi
if ! node_ok && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm install 22 >/dev/null && nvm alias default 22 >/dev/null
fi
if ! node_ok; then
  say "ERROR: this project needs Node.js 20.9 or newer, but found: $(node -v 2>/dev/null || echo 'none')."
  say "Codex: in your environment settings, use 'Set package versions' to pick Node.js 22."
  exit 1
fi

# 2. Project dependencies — skipped when already installed for this package-lock.json.
stamp=node_modules/.bumper-lanes-lock
if [ -f "$stamp" ] && cmp -s package-lock.json "$stamp"; then
  say "Dependencies already installed (Node $(node -v))."
else
  say "Installing dependencies with Node $(node -v)…"
  npm ci --no-audit --no-fund --loglevel=error
  cp package-lock.json "$stamp"
fi

say "Ready. Try: npm run dev · npm test · npm run build"
