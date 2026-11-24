#!/usr/bin/env bash
# Linux-Entwicklung/CI: legt die von Tauri erwarteten Sidecar-Namen als Verknüpfungen
# auf die Systemprogramme an (macOS lädt echte Binärdateien, siehe Task 15).
set -euo pipefail
cd "$(dirname "$0")/.."
triple="$(rustc -vV | sed -n 's/^host: //p')"
mkdir -p src-tauri/binaries
for tool in ffmpeg ffprobe; do
  src="$(command -v "$tool")" || { echo "$tool nicht gefunden" >&2; exit 1; }
  ln -sf "$src" "src-tauri/binaries/$tool-$triple"
done
echo "Sidecars verknüpft für $triple"
