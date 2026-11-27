#!/usr/bin/env bash
# Test adapter: install.sh's command line, run by the Node installer, so the bash scenario and sequence tests
# drive either implementation (MAKKOV_IMPL=node in install/test/). Not for use outside the tests.
here="$(cd "$(dirname "$0")" && pwd)"
exec node "$here/../../../cli/makkov-harness.mjs" install "$@"
