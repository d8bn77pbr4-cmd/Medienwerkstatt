#!/usr/bin/env bash
# Lädt ffmpeg/ffprobe (Intel-Mac, evermeet.cx) und legt sie als Tauri-Sidecars ab.
# Prüft gegen scripts/ffmpeg-mac.sha256; fehlt die Datei, werden die Prüfsummen
# mit Präfix FFMPEG_SHA256: ausgegeben und das Skript bricht ab (erster CI-Lauf).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="9.1"
BASE="https://evermeet.cx/ffmpeg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for tool in ffmpeg ffprobe; do
  curl -fL --retry 3 --retry-delay 5 -o "$TMP/$tool-$VERSION.zip" "$BASE/$tool-$VERSION.zip"
done

if [ -f scripts/ffmpeg-mac.sha256 ]; then
  cp scripts/ffmpeg-mac.sha256 "$TMP/sums"
  (cd "$TMP" && shasum -a 256 -c sums)
else
  SUMS="$(cd "$TMP" && shasum -a 256 "ffmpeg-$VERSION.zip" "ffprobe-$VERSION.zip")"
  echo "scripts/ffmpeg-mac.sha256 fehlt. Prüfsummen zum Übernehmen (Zeilen ohne Präfix in die Datei schreiben):" >&2
  echo "$SUMS" | sed 's/^/FFMPEG_SHA256:/'
  if [ "${MW_TRUST_DOWNLOAD:-}" = "1" ] && [ -t 0 ]; then
    read -r -p "Prüfsummen übernehmen? (j/n) " answer
    if [ "$answer" = "j" ]; then
      echo "$SUMS" > scripts/ffmpeg-mac.sha256
      echo "scripts/ffmpeg-mac.sha256 geschrieben."
    else
      exit 1
    fi
  else
    exit 1
  fi
fi

DEST="src-tauri/binaries"
mkdir -p "$DEST"
for tool in ffmpeg ffprobe; do
  unzip -o -q "$TMP/$tool-$VERSION.zip" -d "$TMP/$tool-out"
  cp "$TMP/$tool-out/$tool" "$DEST/$tool-x86_64-apple-darwin"
  chmod +x "$DEST/$tool-x86_64-apple-darwin"
  file "$DEST/$tool-x86_64-apple-darwin"
  file "$DEST/$tool-x86_64-apple-darwin" | grep -q "x86_64" || { echo "$tool ist keine x86_64-Datei" >&2; exit 1; }
done
echo "Sidecars bereit in $DEST"
