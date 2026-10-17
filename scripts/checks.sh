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
  renderer)
    npm --prefix mail-renderer ci --ignore-scripts --no-audit --no-fund
    node --max-old-space-size=256 mail-renderer/build.mjs --check
    ;;
  web) npm --prefix web test; npm --prefix web run check ;;
  static) python3 tools/verify_foundation_f31.py; uv run --frozen ruff check grant tests tools/prepare_foundation.py tools/verify_foundation_f31.py tools/build_candidate.py tools/verify_candidate.py; git diff --check ;;
  browser)
    # A pre-existing user-local runtime can be selected on minimal Linux hosts.
    if [[ -n "${GRANT_BROWSER_LIBRARY_PATH:-}" ]]; then
      export LD_LIBRARY_PATH="$GRANT_BROWSER_LIBRARY_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    fi
    # Each disposable Playwright webServer uses an independent ephemeral
    # database. Reusing one server for every authenticated scenario exceeds
    # the real 15-per-user/300s login limit near the end of this suite.
    # Preserve that security limit: partition the complete discovered test
    # list into bounded, separately started fixture servers. Every test
    # must still PASS; never retry a failing scenario as a qualification.
    mkdir -p "$ROOT/.dev"
    batch_dir="$(mktemp -d "$ROOT/.dev/grant-browser-batches-XXXXXX")"
    trap 'rm -rf -- "$batch_dir"' EXIT
    GRANT_BROWSER_DISCOVERY=1 npm --prefix web run test:browser -- --list > "$batch_dir/collected.txt"
    sed -n '/^  .* › /s/^  //p' "$batch_dir/collected.txt" > "$batch_dir/all-tests.txt"
    expected="$(sed -n 's/^Total: \([0-9][0-9]*\) tests* in .*/\1/p' "$batch_dir/collected.txt" | tail -1)"
    discovered="$(wc -l < "$batch_dir/all-tests.txt" | tr -d ' ')"
    if [[ -z "$expected" || "$expected" -eq 0 || "$discovered" -ne "$expected" ]]; then
      printf 'BROWSER_DISCOVERY_INVALID expected=%s actual=%s\n' "$expected" "$discovered" >&2
      exit 2
    fi
    # Four scenarios per fixture keeps login/state accumulation well under
    # the enforced per-user window and bounds disposable server lifetime.
    # All URLs and credentials stay in the local disposable browser fixture;
    # never modify live auth limits.
    split -l 4 -d -a 2 "$batch_dir/all-tests.txt" "$batch_dir/batch-"
    evidence_dir="$(mktemp -d "$ROOT/.dev/grant-browser-evidence-XXXXXX")"
    verified=0
    batches=0
    for test_list in "$batch_dir"/batch-[0-9][0-9]; do
      batch_count="$(wc -l < "$test_list" | tr -d ' ')"
      printf 'BROWSER_BATCH_START=%s tests=%s isolated_backend=YES\n' "$batches" "$batch_count"
      batch_port="$(python3 - <<'PYPORT'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PYPORT
)"
      batch_fixture="$batch_dir/fixture-$batches.json"
      batch_output="$batch_dir/results-$batches"
      printf 'BROWSER_BATCH_PORT=%s fixture=isolated output=isolated\n' "$batch_port"
      GRANT_E2E_PORT="$batch_port" GRANT_E2E_FIXTURE_PATH="$batch_fixture" \
        GRANT_E2E_OUTPUT_DIR="$batch_output" \
        npm --prefix web run test:browser -- --test-list "$test_list"
      # The Playwright JSON report is overwritten by the next standalone
      # run. Retain every batch's actual evidence rather than claiming the
      # final batch's JSON qualifies the entire browser suite.
      python3 - "$batch_output/browser-results.json" "$batch_count" <<'PYREPORT'
import json
import sys
from pathlib import Path
report = json.loads(Path(sys.argv[1]).read_text())
stats = report.get("stats") or {}
expected = int(sys.argv[2])
assert stats.get("expected") == expected, (stats, expected)
assert stats.get("unexpected") == 0 and stats.get("skipped") == 0
assert stats.get("flaky") == 0 and not report.get("errors")
print(f"BROWSER_BATCH_VERIFIED={expected}/{expected}")
PYREPORT
      cp "$batch_output/browser-results.json" "$evidence_dir/batch-$batches.json"
      verified=$((verified + batch_count))
      batches=$((batches + 1))
    done
    test "$verified" -eq "$expected"
    printf 'BROWSER_NATIVE_FULL_PASS=%s/%s batches=%s evidence=%s\n' "$verified" "$expected" "$batches" "$evidence_dir"
    ;;
  all) bash scripts/checks.sh static; bash scripts/checks.sh api; bash scripts/checks.sh web; bash scripts/checks.sh browser ;;
  *) printf 'Usage: bash scripts/checks.sh setup|setup-api|setup-web|api|web|renderer|static|browser|all\n' >&2; exit 2 ;;
esac
