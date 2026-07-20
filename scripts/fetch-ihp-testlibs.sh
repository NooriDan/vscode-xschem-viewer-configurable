#!/usr/bin/env bash
# Fetch IHP SG13G2 *test/example* symbol galleries on demand.
#
# These are deliberately NOT bundled in the repo or the VSIX: the default install stays lean, and
# only the primitives (sg13g2_pr) and stdcells that schematics actually instantiate ship by default.
# Run this if you open IHP's example/test schematics and want `sg13g2_tests/…` refs to resolve.
#
# The shipped library map already routes the `sg13g2_test*` prefix to `xschem_lib/ihp-sg13g2/`, so
# no code or manifest change is needed — the files just have to be on disk.
#
# Fetched content is Apache-2.0 (© IHP PDK Authors) and is git-ignored; it is a local convenience,
# not redistributed by this project. See THIRD_PARTY_NOTICES.md.
#
# Requires: git, rsync.
#
# Usage:
#   scripts/fetch-ihp-testlibs.sh                # fetch sg13g2_tests
#   scripts/fetch-ihp-testlibs.sh --with-xyce    # also fetch sg13g2_tests_xyce
#   scripts/fetch-ihp-testlibs.sh --ref v1.0.0   # pin to a tag/branch/commit (default: main)
#   scripts/fetch-ihp-testlibs.sh --remove       # delete what this script installed
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_URL="https://github.com/IHP-GmbH/IHP-Open-PDK.git"
SRC_PREFIX="ihp-sg13g2/libs.tech/xschem"
DEST="dist/xschem_lib/ihp-sg13g2"
REF="main"
LIBS=("sg13g2_tests")

while [ $# -gt 0 ]; do
  case "$1" in
    --with-xyce) LIBS+=("sg13g2_tests_xyce"); shift ;;
    --ref) REF="${2:?--ref needs a value}"; shift 2 ;;
    --remove)
      for l in sg13g2_tests sg13g2_tests_xyce; do
        if [ -d "$DEST/$l" ]; then rm -rf "${DEST:?}/$l"; echo "Removed $DEST/$l"; fi
      done
      exit 0 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v git   >/dev/null || { echo "error: git is required" >&2; exit 1; }
command -v rsync >/dev/null || { echo "error: rsync is required" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching ${LIBS[*]} from $REPO_URL @ $REF ..."
git clone --quiet --depth 1 --filter=blob:none --sparse --branch "$REF" "$REPO_URL" "$TMP/pdk" 2>/dev/null \
  || git clone --quiet --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMP/pdk"
(
  cd "$TMP/pdk"
  # --no-cone: we want specific leaf directories, not whole top-level trees.
  git sparse-checkout set --no-cone $(printf "/%s/%s " "${SRC_PREFIX}" "${LIBS[@]}" | sed "s#${SRC_PREFIX} #${SRC_PREFIX}/#g") >/dev/null 2>&1 \
    || git sparse-checkout set --no-cone "/${SRC_PREFIX}" >/dev/null
  if [ "$REF" != "main" ]; then git checkout --quiet "$REF" 2>/dev/null || true; fi
)

mkdir -p "$DEST"
installed=0
for lib in "${LIBS[@]}"; do
  src="$TMP/pdk/$SRC_PREFIX/$lib"
  if [ ! -d "$src" ]; then
    echo "  warn: $lib not found at $SRC_PREFIX/$lib in $REF — skipping" >&2
    continue
  fi
  # Symbol graphics only (.sym/.sch) — matches what this project is willing to place on disk;
  # no models, no netlists, no foundry-confidential material.
  rsync -a --prune-empty-dirs \
    --include='*/' --include='*.sym' --include='*.sch' --exclude='*' \
    "$src/" "$DEST/$lib/"
  n="$(find "$DEST/$lib" -type f \( -name '*.sym' -o -name '*.sch' \) | wc -l | tr -d ' ')"
  echo "  installed $DEST/$lib  ($n files, $(du -sh "$DEST/$lib" | cut -f1))"
  installed=$((installed + 1))
done

[ "$installed" -gt 0 ] || { echo "Nothing installed." >&2; exit 1; }
cat <<EOF

Done. Reload the VS Code window (Developer: Reload Window) to pick the files up.
These files are git-ignored and are NOT included in the VSIX built by ./build-vsix.sh.
Undo with: scripts/fetch-ihp-testlibs.sh --remove
EOF
