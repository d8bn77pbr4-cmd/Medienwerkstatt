#!/usr/bin/env bash
# Erzeugt die Testmedien unter tests/fixtures/media/ (idempotent: vorhandene Dateien bleiben).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="tests/fixtures/media"
mkdir -p "$OUT"
FF=(${MW_FFMPEG:-ffmpeg} -hide_banner -loglevel error -nostdin -y)

make() { # make <Datei> <ffmpeg-Argumente...>
  local f="$OUT/$1"; shift
  [ -s "$f" ] && return 0
  "${FF[@]}" "$@" "$f.part.${f##*.}"
  mv "$f.part.${f##*.}" "$f"
}

V25=(-f lavfi -i "testsrc2=size=1920x1080:rate=25:duration=5")
V30=(-f lavfi -i "testsrc2=size=1920x1080:rate=30000/1001:duration=5")
A20=(-f lavfi -i "sine=frequency=440:sample_rate=48000:duration=5")
ENC=(-c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p)

make clip-25p.mp4 "${V25[@]}" "${A20[@]}" -af volume=-2dB "${ENC[@]}" -c:a aac -shortest
make clip-30p.mp4 "${V30[@]}" "${A20[@]}" -af volume=-2dB "${ENC[@]}" -c:a aac -shortest
make stumm.mp4 "${V25[@]}" "${ENC[@]}" -an
make "Bäckerei Clip 1.mov" "${V25[@]}" "${A20[@]}" -af volume=-2dB "${ENC[@]}" -c:a aac -shortest

# Hochformat über Rotations-Metadaten: Querformat-Bild mit Display Matrix 90°.
if [ ! -s "$OUT/hochformat-rotiert.mov" ]; then
  "${FF[@]}" "${V25[@]}" "${A20[@]}" -af volume=-2dB "${ENC[@]}" -c:a aac -shortest "$OUT/.rot-src.mov"
  "${FF[@]}" -display_rotation 90 -i "$OUT/.rot-src.mov" -c copy "$OUT/hochformat-rotiert.mov.part.mov"
  mv "$OUT/hochformat-rotiert.mov.part.mov" "$OUT/hochformat-rotiert.mov"
  rm -f "$OUT/.rot-src.mov"
fi

# HDR (HLG), HEVC 10 bit.
make hdr-hlg.mov "${V30[@]}" "${A20[@]}" -af volume=-2dB \
  -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -tag:v hvc1 \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  -x265-params "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:log-level=error" \
  -c:a aac -shortest

# Zu laut: Sinus 0 dBFS, geclippt.
make zu-laut.wav -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=5" \
  -af "volume=24dB,alimiter=limit=1:level=disabled:attack=0.1:release=1" -c:a pcm_s16le
# E2E (Playwright-Chromium kann kein H.264/AAC): VP9 + Opus, 5 s, 1280x720, 25 fps, 440-Hz-Sinus.
VP9=(-c:v libvpx-vp9 -deadline realtime -cpu-used 8 -crf 38 -b:v 0 -pix_fmt yuv420p -g 12 -c:a libopus -b:a 64k -shortest)
make e2e-clip.webm -f lavfi -i "testsrc2=size=1280x720:rate=25:duration=5" "${A20[@]}" "${VP9[@]}"
make e2e-clip2.webm -f lavfi -i "smptebars=size=1280x720:rate=25:duration=5" "${A20[@]}" "${VP9[@]}"
echo "Fixtures bereit in $OUT"
