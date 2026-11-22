#!/usr/bin/env bash
# Node's Single Executable Application (SEA) feature.
#
# Takes the rsbuild CJS bundle and injects it into a copy of the Node
# binary itself, producing a real standalone executable: the target
# machine needs NO Node install and NO npm dependencies at all.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

SOURCE_BUNDLE="$(pwd)/../rsbuild/dist/contract.bundle.cjs"
OUT_DIR="$(pwd)/dist"
OUT_BIN="$OUT_DIR/contract-standalone"

if [[ ! -f "$SOURCE_BUNDLE" ]]; then
  echo "error: $SOURCE_BUNDLE not found. Run 'npm run build' first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# SEA requires a plain CommonJS entry with no shebang line.
tail -n +2 "$SOURCE_BUNDLE" > "$OUT_DIR/sea-entry.cjs"

cat > "$OUT_DIR/sea-config.json" <<JSON
{
  "main": "$OUT_DIR/sea-entry.cjs",
  "output": "$OUT_DIR/sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
JSON

echo "--> generating blob"
node --experimental-sea-config "$OUT_DIR/sea-config.json"

echo "--> copying node binary"
# `command -v node` can resolve to a version-manager shim (asdf, nvm, volta)
# rather than the real executable, which postject can't inject into. Prefer
# `asdf which`, and otherwise fall back to resolving through readlink/file.
if command -v asdf >/dev/null 2>&1 && asdf which node >/dev/null 2>&1; then
  NODE_BIN="$(asdf which node)"
else
  NODE_BIN="$(command -v node)"
fi
cp "$NODE_BIN" "$OUT_BIN"

if [[ "$(uname)" == "Darwin" ]]; then
  echo "--> removing existing code signature (macOS requirement)"
  codesign --remove-signature "$OUT_BIN"
fi

echo "--> injecting blob with postject"
# postject (run through npx) does not resolve relative paths against this
# script's cwd reliably, so every path handed to it above is absolute.
npx --yes postject "$OUT_BIN" NODE_SEA_BLOB "$OUT_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  $( [[ "$(uname)" == "Darwin" ]] && echo "--macho-segment-name NODE_SEA" )

if [[ "$(uname)" == "Darwin" ]]; then
  echo "--> re-signing (macOS requirement)"
  codesign --sign - "$OUT_BIN"
fi

chmod +x "$OUT_BIN"
echo "--> done: $OUT_BIN"
