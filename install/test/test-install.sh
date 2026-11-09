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

# Updating in place: a newer copy of the harness replaces the old one without treating it as yours,
# and the uninstall then leaves nothing of either behind.
src="$(mktemp -d)"; cp -R "$repo/install" "$repo/skills" "$repo/ROUTING.md" "$src/"
home="$(mktemp -d)"; proj="$(mktemp -d)"; export HOME="$home"
echo "codex project, update in place, then uninstall"
bash "$src/install/install.sh" codex "$proj" >/dev/null
echo "new in this version" > "$src/skills/animate/CHANGES.md"
bash "$src/install/install.sh" codex "$proj" >/dev/null
check "the update replaced our animate" "[ -f '$proj/.agents/skills/animate/CHANGES.md' ]"
check "the update made no backup of ours" "[ ! -e '$proj/.makkov-harness/backups' ] || [ -z \"\$(ls -A '$proj/.makkov-harness/backups')\" ]"
bash "$src/install/uninstall.sh" codex "$proj" >/dev/null
check "nothing of the harness left after uninstall" "[ ! -e '$proj/.agents/skills/animate' ] && [ ! -e '$proj/.agents/skills/design-score' ]"
rm -rf "$home" "$proj"

# An install made before 0.5.0 (no fingerprints in its manifest): its copies are set aside, not restored.
home="$(mktemp -d)"; proj="$(mktemp -d)"; export HOME="$home"
echo "codex project, update over an install from before 0.5.0"
bash "$src/install/install.sh" codex "$proj" >/dev/null
sed -i.orig 's/^\(skill=[^ ]*\) .*/\1/' "$proj/.makkov-harness/install-codex.txt" && rm -f "$proj/.makkov-harness/install-codex.txt.orig"
echo "newer still" >> "$src/skills/animate/CHANGES.md"
bash "$src/install/install.sh" codex "$proj" >/dev/null
check "the old copy went to earlier-harness" "ls '$proj'/.makkov-harness/backups/*/earlier-harness/animate >/dev/null 2>&1"
check "nothing went to the restore list" "! grep -q '^backup=' '$proj/.makkov-harness/install-codex.txt'"
bash "$src/install/uninstall.sh" codex "$proj" >/dev/null
check "the uninstall restores no old harness copy" "[ ! -e '$proj/.agents/skills/animate' ]"
rm -rf "$home" "$proj" "$src"

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

# The personal layer harness-onboarding writes: an update keeps it, the uninstall removes it.
home="$(mktemp -d)"; proj="$(mktemp -d)"; export HOME="$home"
echo "codex project and cursor project, with a personal layer"
printf '# my notes\n' > "$proj/AGENTS.md"
bash "$inst" codex "$proj" >/dev/null
printf '\n<!-- makkov-harness:personal:start -->\n# Personal layer (makkov-harness)\n- Answer in English.\n<!-- makkov-harness:personal:end -->\n' >> "$proj/AGENTS.md"
bash "$inst" codex "$proj" >/dev/null
check "an update keeps the personal layer" "grep -q '^- Answer in English.' '$proj/AGENTS.md'"
bash "$uninst" codex "$proj" >/dev/null
check "the uninstall removes the personal layer" "! grep -q -e 'makkov-harness:personal' -e '^- Answer in English.' '$proj/AGENTS.md'"
check "your notes kept" "grep -qx '# my notes' '$proj/AGENTS.md'"
bash "$inst" cursor "$proj" >/dev/null
printf -- '---\nalwaysApply: true\n---\n<!-- makkov-harness:personal:start -->\n- Answer in English.\n<!-- makkov-harness:personal:end -->\n' > "$proj/.cursor/rules/makkov-harness-personal.mdc"
bash "$uninst" cursor "$proj" >/dev/null
check "the uninstall removes Cursor's personal rule" "[ ! -e '$proj/.cursor/rules/makkov-harness-personal.mdc' ]"
rm -rf "$home" "$proj"

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
