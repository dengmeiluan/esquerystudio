#!/bin/bash
# Package the Chrome extension for Chrome Web Store submission.
# Usage: bash extensions/chrome/package-for-store.sh
# Produces: dist/esquerystudio-extension-<version>.zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="$(cd "$ROOT_DIR" && node -p "require('./extensions/chrome/manifest.json').version")"
PACKAGE_DIR="$ROOT_DIR/build/extension-package"
ZIP_NAME="esquerystudio-extension-$VERSION.zip"
ZIP_PATH="$ROOT_DIR/dist/$ZIP_NAME"

echo "=== Packaging ESQueryStudio Chrome Extension v$VERSION ==="

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR" "$ROOT_DIR/dist"
rm -f "$ZIP_PATH"

# Manifest + top-level extension pages and scripts.
cp "$SCRIPT_DIR/manifest.json" "$PACKAGE_DIR/"
cp "$SCRIPT_DIR/app.css" "$PACKAGE_DIR/"
cp "$SCRIPT_DIR/index.html" "$PACKAGE_DIR/"
for f in app.js background.js core.js monitor.js query.js reindex.js rest.js; do
  cp "$SCRIPT_DIR/$f" "$PACKAGE_DIR/"
done

# Built Vue console and icons.
cp -r "$SCRIPT_DIR/app" "$PACKAGE_DIR/app"
cp -r "$SCRIPT_DIR/icons" "$PACKAGE_DIR/icons"

# Refuse to ship development-only files.
if find "$PACKAGE_DIR" -maxdepth 1 \
  \( -name 'README.md' -o -name 'store-listing.md' -o -name 'package-for-store.sh' \) | grep -q .; then
  echo "ERROR: development files leaked into the package" >&2
  exit 1
fi

SIZE="$(du -sh "$PACKAGE_DIR" | cut -f1)"
echo "Unpacked size: $SIZE"

echo "Creating ZIP archive..."
if python3 --version >/dev/null 2>&1; then PYTHON_BIN=python3; else PYTHON_BIN=python; fi
"$PYTHON_BIN" "$SCRIPT_DIR/pack_zip.py" "$PACKAGE_DIR" "$ZIP_PATH"

echo ""
echo "=== Success ==="
echo "Package: $ZIP_PATH"
echo "Upload at: https://chrome.google.com/webstore/devconsole"
