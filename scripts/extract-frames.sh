#!/usr/bin/env bash
# Turn a scene video into a numbered WebP frame sequence for <FrameSequence />.
#
# Usage:
#   scripts/extract-frames.sh <input-video> <scene-id> [fps] [width] [quality]
#
# Example:
#   scripts/extract-frames.sh assets/video/door.mp4 door 24 2560 90
#
# Output: public/frames/<scene-id>/0001.webp, 0002.webp, ...
# Then set `frameCount` for the scene in src/lib/scenes.ts (script prints it).
#
# Quality is deliberately high by default. Reduce *how many* frames you ship
# (lower fps) before you ever reduce their resolution or quality.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  sed -n '2,13p' "$0"
  exit 1
fi

INPUT="$1"
SCENE="$2"
FPS="${3:-24}"
WIDTH="${4:-2560}"
QUALITY="${5:-90}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
[ -f "$INPUT" ] || { echo "input not found: $INPUT" >&2; exit 1; }

OUT="public/frames/${SCENE}"
rm -rf "$OUT"
mkdir -p "$OUT"

# scale=W:-2 keeps aspect ratio (even height); never upscales beyond source.
ffmpeg -hide_banner -loglevel error -i "$INPUT" \
  -vf "fps=${FPS},scale='min(${WIDTH},iw)':-2:flags=lanczos" \
  -c:v libwebp -quality "$QUALITY" -compression_level 6 \
  "${OUT}/%04d.webp"

COUNT=$(find "$OUT" -name '*.webp' | wc -l | tr -d ' ')
SIZE=$(du -sh "$OUT" | cut -f1)
echo "scene=${SCENE} frames=${COUNT} size=${SIZE}"
echo "-> set frameCount: ${COUNT} for '${SCENE}' in src/lib/scenes.ts"
