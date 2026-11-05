#!/bin/bash
# Design tools for Claude Code cloud sessions (Anthropic-hosted, Ubuntu 24.04, runs as root).
# Paste into: claude.ai/code -> environment -> Edit -> Setup script (or append to an existing one).
#
# What it adds on top of the preinstalled image (Node 22, Chrome for Testing at $CHROME_PATH):
#   - ffmpeg                      -> HyperFrames renders video to MP4
#   - puppeteer-core 25.16.0      -> Hallmark browser checks (sloplint --render, screenshots)
#   - hyperframes CLI 0.9.9       -> HyperFrames, pinned to the version its skills were synced from
#
# Every package was reviewed with third-party-install-guard on 2026-11-04 (verdict: green).
# Versions are pinned on purpose: bump them only after a new review.
# Installs run with --ignore-scripts: none of these packages needs an install script.
# Needs network access "Trusted" (default) or wider: npm registry and Ubuntu archives.

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
log() { echo "[design-tools] $*"; }

# Parallel, so the whole script stays well under the ~5 minute cache limit.
(
  apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg >/dev/null \
    && log "ffmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3)" \
    || log "WARNING: ffmpeg install failed (HyperFrames cannot render MP4)"
) &
(
  npm install -g --ignore-scripts --no-audit --no-fund \
      puppeteer-core@25.16.0 hyperframes@0.9.9 >/dev/null 2>&1 \
    && log "puppeteer-core 25.16.0 and hyperframes 0.9.9 installed in $(npm root -g)" \
    || log "WARNING: npm install failed (Hallmark browser checks / HyperFrames unavailable)"
) &
wait

# Hallmark finds puppeteer-core through `npm root -g`; Chrome is preinstalled and CHROME_PATH is set by the image.
# HyperFrames telemetry: add HYPERFRAMES_NO_TELEMETRY=1 to the environment's variables (setup scripts cannot set them).

# puppeteer-core 25 needs Node >= 22.12
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<12))console.log("[design-tools] WARNING: Node "+process.versions.node+" is older than 22.12, puppeteer-core may fail")'

log "done"
exit 0
