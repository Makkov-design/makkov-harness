#!/usr/bin/env bash
# End-to-end test of install.sh and uninstall.sh for every agent, in throwaway homes and projects.
# Run from anywhere: bash install/test/test-install.sh
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
inst="$repo/install/install.sh"; uninst="$repo/install/uninstall.sh"
expected="$(find "$repo/skills" -mindepth 1 -maxdepth 1 -type d ! -name rich-report | wc -l | tr -d ' ')"
fails=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fails=$((fails + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
markers() { grep -c '<!-- makkov-harness:start -->' "$1" 2>/dev/null || true; }

run_agent() {
  local agent="$1" scope="$2" home proj base skills rules
  home="$(mktemp -d)"; proj="$(mktemp -d)"
  export HOME="$home"
  local p=""; [ "$scope" = project ] && p="$proj"
  base="${p:-$home}"
  case "$agent" in cline) skills="$base/.cline/skills" ;; aider) skills="" ;; *) skills="$base/.agents/skills" ;; esac
  case "$agent:$scope" in
    codex:home) rules="$home/.codex/AGENTS.md" ;; gemini:home) rules="$home/.gemini/GEMINI.md" ;;
    opencode:home) rules="$home/.config/opencode/AGENTS.md" ;; cline:home) rules="$home/.agents/AGENTS.md" ;;
    gemini:project) rules="$proj/GEMINI.md" ;; cursor:project) rules="$proj/.cursor/rules/makkov-harness.mdc" ;;
    aider:project) rules="$proj/CONVENTIONS.md" ;; *) rules="$proj/AGENTS.md" ;;
  esac
  echo "$agent ($scope)"

  # dry run writes nothing
  bash "$inst" "$agent" $p --dry-run >/dev/null
  check "dry run writes nothing" "[ \"\$(find '$home' '$proj' -type f | wc -l | tr -d ' ')\" = 0 ]"

  # a skill of yours with the same name as ours is kept
  if [ -n "$skills" ]; then mkdir -p "$skills/animate"; echo mine > "$skills/animate/SKILL.md"; fi

  bash "$inst" "$agent" $p >/dev/null
  if [ -n "$skills" ]; then
    check "all $expected skills copied" "[ \"\$(find '$skills' -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')\" = $expected ]"
    check "your animate moved to the backup folder" "grep -qx mine '$base'/.makkov-harness/backups/*/skills/animate/SKILL.md"
    check "rich-report skipped" "[ ! -e '$skills/rich-report' ]"
  fi
  check "routing block written once" "[ \"\$(markers '$rules')\" = 1 ]"
  check "manifest written" "[ -f '$base/.makkov-harness/install-$agent.txt' ]"

  bash "$inst" "$agent" $p >/dev/null
  check "second run keeps one routing block" "[ \"\$(markers '$rules')\" = 1 ]"
  check "second run makes no new skill backup" "[ \"\$(ls '$base/.makkov-harness/backups' | wc -l | tr -d ' ')\" -le 1 ]"

  bash "$uninst" "$agent" $p >/dev/null
  if [ -n "$skills" ]; then
    check "our skills removed" "[ ! -e '$skills/design-score' ]"
    check "your animate restored" "grep -qx mine '$skills/animate/SKILL.md'"
  fi
  if [ "$agent" = cursor ]; then check "Cursor rule removed" "[ ! -e '$rules' ]"
  else check "routing block removed" "[ ! -f '$rules' ] || [ \"\$(markers '$rules')\" = 0 ]"; fi
  check "manifest removed" "[ ! -f '$base/.makkov-harness/install-$agent.txt' ]"
  rm -rf "$home" "$proj"
}

for a in codex gemini opencode cline; do run_agent "$a" home; done
for a in codex cursor gemini copilot windsurf cline opencode aider; do run_agent "$a" project; done

# Your own instructions survive an install and an uninstall.
home="$(mktemp -d)"; export HOME="$home"; mkdir -p "$home/.codex"; printf '# my notes\n' > "$home/.codex/AGENTS.md"
echo "codex with your own AGENTS.md"
bash "$inst" codex >/dev/null
check "a dated backup of your file" "ls '$home'/.codex/AGENTS.md.bak-* >/dev/null 2>&1"
bash "$uninst" codex >/dev/null
check "your notes kept, block gone" "grep -qx '# my notes' '$home/.codex/AGENTS.md' && [ \"\$(markers '$home/.codex/AGENTS.md')\" = 0 ]"
rm -rf "$home"

# A project path with spaces.
home="$(mktemp -d)"; proj="$(mktemp -d)/My Project"; mkdir -p "$proj/.agents/skills/animate"; export HOME="$home"
echo mine > "$proj/.agents/skills/animate/SKILL.md"
echo "codex, project path with spaces"
bash "$inst" codex "$proj" >/dev/null
check "installed into the spaced path" "[ -e \"$proj/.agents/skills/design-score/SKILL.md\" ]"
bash "$uninst" codex "$proj" >/dev/null
check "your animate restored from the spaced path" "grep -qx mine \"$proj/.agents/skills/animate/SKILL.md\""
check "our skills removed from the spaced path" "[ ! -e \"$proj/.agents/skills/design-score\" ]"
rm -rf "$home" "$(dirname "$proj")"

# --scope design keeps only design routing.
home="$(mktemp -d)"; proj="$(mktemp -d)"; export HOME="$home"
echo "codex project, --scope design"
bash "$inst" codex "$proj" --scope design >/dev/null
check "research and install rows dropped" "! grep -q -e '^| Research, analysis' -e '^| Installing, adding' '$proj/AGENTS.md'"
check "design rows kept" "grep -q '^| A design score' '$proj/AGENTS.md'"
check "the block says it is design-only" "grep -q '^Scope: design work only' '$proj/AGENTS.md'"
bash "$uninst" codex "$proj" >/dev/null
rm -rf "$home" "$proj"

echo
if [ "$fails" = 0 ]; then echo "installer tests: all passed"; else echo "installer tests: $fails failed"; exit 1; fi
