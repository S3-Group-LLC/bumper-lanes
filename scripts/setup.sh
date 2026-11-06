#!/usr/bin/env bash
# Bumper Lanes setup: installs everything your project needs, up front.
#
# Cloud agents may lose internet access once they start working, so this
# script installs everything at the very start of a session: Node.js packages,
# plus (on cloud Linux machines) the GitHub CLI `gh` and the Supabase CLI.
#
#   Claude Code (claude.ai/code): runs automatically. .claude/settings.json
#     calls it when a cloud session starts. Nothing to configure.
#   Codex (chatgpt.com/codex): use this line as the environment's install
#     (setup) script:
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

# 3. Command-line tools your agent may use: gh (GitHub) and supabase, pinned to the same
#    version as the workflows. Only on cloud Linux machines (on your own computer, install
#    them yourself if you want them). Never fatal: without internet, setup still succeeds.
GH_VERSION=2.101.0
SUPABASE_VERSION=2.117.0
install_tool() { # <name> <version> <url> <checksums-url> <archive-file>
  local name="$1" version="$2" url="$3" sums="$4" file="$5" tmp
  tmp="$(mktemp -d)"
  if curl -fsSL --retry 2 --max-time 60 -o "$tmp/$file" "$url" &&
    curl -fsSL --retry 2 --max-time 30 -o "$tmp/sums" "$sums" &&
    (cd "$tmp" && grep " $file\$" sums | sha256sum -c --quiet -) &&
    tar -xzf "$tmp/$file" -C "$tmp"; then
    find "$tmp" -type f -name "$name" -perm -u+x -exec cp {} "$bin/$name" \; || true
  fi
  if [ -x "$bin/$name" ]; then
    say "Installed $name $version."
  else
    say "Note: couldn't install $name $version (no internet?). Everything else works without it."
  fi
  rm -rf "$tmp"
}
if [ "$(uname -s)" = "Linux" ] && { [ "${GITHUB_ACTIONS:-}" != "true" ] || [ "${BUMPER_LANES_TOOLS:-}" = "1" ]; }; then
  arch="$(uname -m)"; case "$arch" in x86_64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; esac
  if [ -w /usr/local/bin ]; then bin=/usr/local/bin; else bin="$HOME/.local/bin"; fi
  mkdir -p "$bin"
  case ":$PATH:" in *":$bin:"*) ;; *)
    export PATH="$bin:$PATH"
    # Keep it on PATH for the agent: Codex reads ~/.bashrc; Claude Code reads CLAUDE_ENV_FILE.
    grep -qs "$bin" "$HOME/.bashrc" || echo "export PATH=\"$bin:\$PATH\"" >> "$HOME/.bashrc"
    [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "export PATH=\"$bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    ;;
  esac
  if command -v gh >/dev/null 2>&1; then
    say "GitHub CLI already installed ($(gh --version | head -1))."
  else
    install_tool gh "$GH_VERSION" \
      "https://github.com/cli/cli/releases/download/v$GH_VERSION/gh_${GH_VERSION}_linux_$arch.tar.gz" \
      "https://github.com/cli/cli/releases/download/v$GH_VERSION/gh_${GH_VERSION}_checksums.txt" \
      "gh_${GH_VERSION}_linux_$arch.tar.gz"
  fi
  if command -v supabase >/dev/null 2>&1; then
    say "Supabase CLI already installed ($(supabase --version 2>/dev/null))."
  else
    install_tool supabase "$SUPABASE_VERSION" \
      "https://github.com/supabase/cli/releases/download/v$SUPABASE_VERSION/supabase_${SUPABASE_VERSION}_linux_$arch.tar.gz" \
      "https://github.com/supabase/cli/releases/download/v$SUPABASE_VERSION/checksums.txt" \
      "supabase_${SUPABASE_VERSION}_linux_$arch.tar.gz"
  fi
fi

say "Ready. Try: npm run dev · npm test · npm run build"
