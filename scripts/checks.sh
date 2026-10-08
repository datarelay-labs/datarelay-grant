#!/usr/bin/env bash
# Reproducible product checks. Isolated tools; no system package or policy changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/.dev/node-runtime/node_modules/.bin:$ROOT/.dev/toolchain/bin:$PATH"
# Vite builds replace web/dist. Serialize only web and browser qualifications,
# preventing a concurrent Playwright run from observing FRONTEND_NOT_BUILT.
if [[ "${1:-}" == "web" || "${1:-}" == "browser" ]] && command -v flock >/dev/null 2>&1; then
  if [[ "${GRANT_WEB_BROWSER_LOCK_HELD:-}" != "1" ]]; then
    mkdir -p "$ROOT/.dev"
    exec flock -w 180 "$ROOT/.dev/web-browser-qualification.lock"       env GRANT_WEB_BROWSER_LOCK_HELD=1 bash "$0" "$@"
  fi
fi
case "${1:-all}" in
  setup-api)
    if [[ "$(uv --version 2>/dev/null || true)" != uv\ 0.12.18* ]]; then
      python3 -m venv .dev/toolchain
      .dev/toolchain/bin/python -m pip install --disable-pip-version-check 'uv==0.12.18'
    fi
    uv sync --frozen
    ;;
  setup-web)
    if [[ "$(node --version 2>/dev/null || true)" != 'v24.21.0' ]]; then
      npm install --prefix .dev/node-runtime --no-audit --no-fund --package-lock=false 'node@24.21.0'
    fi
    test "$(node --version)" = 'v24.21.0'
    if [[ -n "${GRANT_FOUNDATION_SOURCE:-}" ]]; then
      python3 tools/prepare_foundation.py --source "$GRANT_FOUNDATION_SOURCE"
    else
      python3 tools/prepare_foundation.py
    fi
    npm --prefix web ci --no-audit --no-fund
    ;;
  setup) bash scripts/checks.sh setup-api; bash scripts/checks.sh setup-web ;;
  api) uv run --frozen pytest ;;
  web) npm --prefix web test; npm --prefix web run check ;;
  static) uv run --frozen ruff check grant tests tools/prepare_foundation.py tools/build_candidate.py tools/verify_candidate.py; git diff --check ;;
  browser)
    # A pre-existing user-local runtime can be selected on minimal Linux hosts.
    if [[ -n "${GRANT_BROWSER_LIBRARY_PATH:-}" ]]; then
      export LD_LIBRARY_PATH="$GRANT_BROWSER_LIBRARY_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    fi
    npm --prefix web run test:browser
    ;;
  all) bash scripts/checks.sh static; bash scripts/checks.sh api; bash scripts/checks.sh web; bash scripts/checks.sh browser ;;
  *) printf 'Usage: bash scripts/checks.sh setup|setup-api|setup-web|api|web|static|browser|all\n' >&2; exit 2 ;;
esac
