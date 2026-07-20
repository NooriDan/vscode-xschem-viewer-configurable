#!/usr/bin/env bash
# Rebuild the installable VSIX from this tree. Requires: node, zip, rsync.
set -euo pipefail
cd "$(dirname "$0")"

VER="$(node -e "console.log(require('./package.json').version)")"
OUT="xschem-viewer-configurable-${VER}.vsix"
BUILD=".vsixbuild"

rm -rf "$BUILD" "$OUT"
mkdir -p "$BUILD/extension"

# Assemble the extension payload: runtime files only (not repo/packaging/docs meta).
rsync -a \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='.vsixbuild' \
  --exclude='packaging' \
  --exclude='test' \
  --exclude='build-vsix.sh' \
  --exclude='.gitignore' \
  --exclude='FEATURE.md' \
  --exclude='TODO.md' \
  --exclude='*.vsix' \
  ./ "$BUILD/extension/"

# OPC package files at the archive root.
node packaging/gen-content-types.cjs "$BUILD/extension" "$BUILD/[Content_Types].xml"
sed "s/__VERSION__/${VER}/" packaging/extension.vsixmanifest > "$BUILD/extension.vsixmanifest"

( cd "$BUILD" && zip -r -X -q "../${OUT}" '[Content_Types].xml' extension.vsixmanifest extension )
rm -rf "$BUILD"

echo "Built ${OUT}"
echo "Install with: code --install-extension ${OUT} --force   (then: Developer: Reload Window)"
