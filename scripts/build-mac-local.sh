#!/usr/bin/env bash
# Baut die .dmg direkt auf dem eigenen Mac (Fallback, wenn der GitHub-Build nicht läuft).
set -euo pipefail
cd "$(dirname "$0")/.."

fehlt=0
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Xcode-Befehlszeilentools fehlen. Installieren mit: xcode-select --install (danach das Skript erneut starten)." >&2
  fehlt=1
fi
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//;s/\..*//')" -lt 20 ]; then
  echo "Node.js ab Version 20 fehlt. Den LTS-Installer von https://nodejs.org laden und installieren." >&2
  fehlt=1
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust fehlt. Installieren mit: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh (danach ein neues Terminal öffnen)." >&2
  fehlt=1
fi
[ "$fehlt" = 0 ] || exit 1

npm ci
MW_TRUST_DOWNLOAD=1 bash scripts/fetch-ffmpeg-mac.sh

if [ "$(uname -m)" = "arm64" ]; then
  rustup target add x86_64-apple-darwin
  npx tauri build --target x86_64-apple-darwin --bundles dmg
  DIR="target/x86_64-apple-darwin/release/bundle/dmg"
else
  npx tauri build --bundles dmg
  DIR="target/release/bundle/dmg"
fi

echo "Fertig. Die .dmg liegt in: $PWD/$DIR"
ls -1 "$DIR"/*.dmg
open "$DIR"
