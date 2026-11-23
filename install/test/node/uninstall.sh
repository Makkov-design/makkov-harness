#!/usr/bin/env bash
# Test adapter: uninstall.sh's command line, run by the Node installer (see install.sh next to this file).
here="$(cd "$(dirname "$0")" && pwd)"
exec node "$here/../../../bin/makkov-harness.mjs" uninstall "$@"
