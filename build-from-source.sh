#!/usr/bin/env bash
# Rebuild dist/assets/ from the REAL TypeScript sources instead of hand-patching the minified bundle.
#
# The viewer's WebAssembly (wacl.wasm) is checked into the upstream repo, so this needs only Node +
# a Vite build — no emscripten toolchain.
#
# What it does:
#   1. clones TinyTapeout/xschem-viewer at the pinned commit below
#   2. applies patches/xschem-viewer/*.patch  (the configurable resolver + the local library map)
#   3. installs patches/xschem-viewer/vite.config.js (un-hashed asset names, relative base)
#   4. builds, and stages the result under .fromsource/
#
# By default it STAGES ONLY and diffs against the committed bundle — it will not overwrite
# dist/assets until you pass --install, so a rebuild can never silently change the shipped artifact.
#
#   ./build-from-source.sh                 # build + report what would change
#   ./build-from-source.sh --install       # build + overwrite dist/assets, then run `npm test`
#   ./build-from-source.sh --ref <commit>  # build against a different upstream commit
#
# After --install, ALWAYS verify a real render (npm run test:smoke, or open a .sch in VS Code):
# `npm test` checks resolution logic, not that the WASM viewer still paints.
set -euo pipefail
cd "$(dirname "$0")"

# Pinned so a rebuild is reproducible; bump deliberately, then re-run the test suite.
UPSTREAM_URL="https://github.com/TinyTapeout/xschem-viewer.git"
UPSTREAM_REF="4a2bc83f88fa92528db197ede8d9cdb219092fd6"
STAGE=".fromsource"
INSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --install) INSTALL=1; shift ;;
    --ref) UPSTREAM_REF="${2:?--ref needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v git  >/dev/null || { echo "error: git is required" >&2; exit 1; }
command -v node >/dev/null || { echo "error: node is required" >&2; exit 1; }
command -v npm  >/dev/null || { echo "error: npm is required" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE"
SRC="$STAGE/xschem-viewer"

echo "==> cloning $UPSTREAM_URL @ ${UPSTREAM_REF:0:12}"
git clone --quiet "$UPSTREAM_URL" "$SRC"
git -C "$SRC" checkout --quiet "$UPSTREAM_REF"

echo "==> applying patches"
for p in patches/xschem-viewer/*.patch; do
  echo "    $(basename "$p")"
  # --check first so a drifted patch fails loudly with a clear message instead of half-applying.
  git -C "$SRC" apply --check -p1 "$PWD/$p" || {
    echo "error: $p does not apply to ${UPSTREAM_REF:0:12}." >&2
    echo "       Upstream moved; re-cut the patch against the new source and bump UPSTREAM_REF." >&2
    exit 1
  }
  git -C "$SRC" apply -p1 "$PWD/$p"
done
cp patches/xschem-viewer/vite.config.js "$SRC/vite.config.js"

echo "==> installing dependencies"
( cd "$SRC" && npm ci --no-audit --no-fund --silent )

echo "==> building"
( cd "$SRC" && npm run build )

# The extension serves dist/assets/{index.js,index.css,wacl.js,wacl.wasm}.
built="$SRC/dist/assets"
[ -f "$built/index.js" ] || { echo "error: build produced no assets/index.js" >&2; exit 1; }

echo
echo "==> built assets"
for f in index.js index.css wacl.js wacl.wasm; do
  [ -f "$built/$f" ] && printf '    %-12s %10s bytes\n' "$f" "$(wc -c < "$built/$f")"
done

echo
echo "==> comparison with the committed bundle"
changed=0
for f in index.js index.css wacl.js wacl.wasm; do
  if [ ! -f "$built/$f" ]; then continue; fi
  if [ ! -f "dist/assets/$f" ]; then echo "    NEW      $f"; changed=1; continue; fi
  if cmp -s "$built/$f" "dist/assets/$f"; then
    printf '    same     %s\n' "$f"
  else
    printf '    DIFFERS  %-12s (committed %s bytes -> built %s bytes)\n' \
      "$f" "$(wc -c < "dist/assets/$f")" "$(wc -c < "$built/$f")"
    changed=1
  fi
done

if [ "$INSTALL" -eq 0 ]; then
  echo
  if [ "$changed" -eq 1 ]; then
    echo "Staged only — dist/assets was NOT modified. Re-run with --install to apply."
  else
    echo "Built output is identical to the committed bundle."
  fi
  echo "Staged tree: $STAGE"
  exit 0
fi

echo
echo "==> installing into dist/assets"
for f in index.js index.css wacl.js wacl.wasm; do
  [ -f "$built/$f" ] && cp -f "$built/$f" "dist/assets/$f" && echo "    $f"
done

echo
echo "==> npm test"
npm test

cat <<'EOF'

Installed. `npm test` covers resolution logic only — it does NOT prove the WASM viewer still
renders. Before committing, verify a real render:
    npm run test:smoke        (headless; needs playwright)
    or open a .sch in VS Code after: Developer: Reload Window
EOF
