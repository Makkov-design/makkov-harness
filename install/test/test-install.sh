#!/usr/bin/env bash
# End-to-end test of install.sh and uninstall.sh, in throwaway homes and projects (never your own).
# Each block below states one behaviour the installers promise; install/test/test-install.ps1 checks the same
# behaviours for install.ps1 / uninstall.ps1. Run from anywhere: bash install/test/test-install.sh
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
inst="$repo/install/install.sh"; uninst="$repo/install/uninstall.sh"
expected="$(find "$repo/skills" -mindepth 1 -maxdepth 1 -type d ! -name rich-report | wc -l | tr -d ' ')"
fails=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fails=$((fails + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
markers() { grep -c '<!-- makkov-harness:start -->' "$1" 2>/dev/null || true; }
tmp() { mktemp -d; }
# Every file and link under a folder with its checksum: two equal snapshots mean nothing changed.
snap() { (cd "$1" && find . \( -type f -o -type l \) ! -path './.makkov-harness/install-*' -exec sh -c 'for f; do if [ -L "$f" ]; then echo "$f -> $(readlink "$f")"; else echo "$f $(cksum < "$f")"; fi; done' _ {} + | LC_ALL=C sort); }
# A copy of the harness to edit (a newer version of a skill, a skill renamed upstream) without touching this one.
harness_copy() { local d; d="$(tmp)"; cp -R "$repo/install" "$repo/skills" "$repo/ROUTING.md" "$d/"; echo "$d"; }

run_agent() {
  local agent="$1" scope="$2" home proj base skills rules
  home="$(tmp)"; proj="$(tmp)"
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
  check "dry run writes nothing" "[ \"\$(find '$home' '$proj' -mindepth 1 | wc -l | tr -d ' ')\" = 0 ]"

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

  local before; before="$(snap "$base")"
  bash "$inst" "$agent" $p --dry-run >/dev/null
  check "dry run of an update writes nothing" "[ \"\$(snap '$base')\" = \"\$before\" ]"
  sleep 1
  bash "$inst" "$agent" $p >/dev/null
  check "second run keeps one routing block" "[ \"\$(markers '$rules')\" = 1 ]"
  check "second run changes no file and makes no backup" "[ \"\$(snap '$base')\" = \"\$before\" ]"

  bash "$uninst" "$agent" $p >/dev/null
  if [ -n "$skills" ]; then
    check "our skills removed" "[ ! -e '$skills/design-score' ]"
    check "your animate restored" "grep -qx mine '$skills/animate/SKILL.md'"
    rm -rf "$skills/animate"; rmdir "$skills" "$(dirname "$skills")" 2>/dev/null || true
  fi
  if [ "$agent" = cursor ]; then check "Cursor rule removed" "[ ! -e '$rules' ]"
  else check "routing block removed" "[ ! -f '$rules' ] || [ \"\$(markers '$rules')\" = 0 ]"; fi
  check "manifest removed" "[ ! -f '$base/.makkov-harness/install-$agent.txt' ]"
  check "nothing else left behind" "[ -z \"\$(find '$home' '$proj' -mindepth 1)\" ]"
  rm -rf "$home" "$proj"
}

for a in codex gemini opencode cline; do run_agent "$a" home; done
for a in codex cursor gemini copilot windsurf cline opencode aider; do run_agent "$a" project; done

# Your own instructions file: kept once as it was before the first install, and put back byte for byte by the
# uninstall, also after several updates and when it does not end in a newline. No *.bak files next to it.
for ending in newline none; do
  home="$(tmp)"; export HOME="$home"; mkdir -p "$home/.codex"
  if [ "$ending" = newline ]; then printf '# my notes\n\nmore\n' > "$home/.codex/AGENTS.md"; else printf '# my notes' > "$home/.codex/AGENTS.md"; fi
  cp "$home/.codex/AGENTS.md" "$home/expected"
  echo "codex with your own AGENTS.md (ending: $ending), three installs and an uninstall"
  bash "$inst" codex >/dev/null
  check "a copy of your file as it was" "cmp -s '$home/expected' '$home/.makkov-harness/backups/original/.codex/AGENTS.md'"
  sleep 1; bash "$inst" codex >/dev/null; sleep 1; bash "$inst" codex >/dev/null
  check "no *.bak files next to your file" "[ -z \"\$(ls '$home/.codex' | grep -v '^AGENTS.md$')\" ]"
  check "the block sits after one blank line" "grep -B1 -m1 'makkov-harness:start' '$home/.codex/AGENTS.md' | head -n 1 | grep -qx ''"
  bash "$uninst" codex >/dev/null
  check "your file put back byte for byte" "cmp -s '$home/expected' '$home/.codex/AGENTS.md'"
  rm -f "$home/expected"
  check "nothing else left behind" "[ \"\$(cd '$home' && find . -mindepth 1 | LC_ALL=C sort | tr '\n' ' ')\" = './.codex ./.codex/AGENTS.md ' ]"
  rm -rf "$home"
done
# Edited since the install: your edits stay, only the harness's lines go.
home="$(tmp)"; export HOME="$home"; mkdir -p "$home/.codex"; printf '# my notes\n' > "$home/.codex/AGENTS.md"
echo "codex with your own AGENTS.md, edited after the install"
bash "$inst" codex >/dev/null
printf '# added later\n' >> "$home/.codex/AGENTS.md"
bash "$uninst" codex >/dev/null
check "your notes and your later edit kept, block gone" "[ \"\$(cat '$home/.codex/AGENTS.md')\" = \"\$(printf '# my notes\n\n# added later')\" ]"
check "no harness folder left" "[ ! -e '$home/.makkov-harness' ]"
rm -rf "$home"

# Two agents in one project share <project>/AGENTS.md and .agents/skills: uninstalling one leaves the other
# working (its routing block, its personal layer, its skills); the last uninstall puts your file back.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex and copilot in one project, uninstalled one at a time"
printf '# my notes\n' > "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
bash "$inst" codex "$proj" >/dev/null; bash "$inst" copilot "$proj" >/dev/null
check "one routing block for both" "[ \"\$(markers '$proj/AGENTS.md')\" = 1 ]"
printf '\n<!-- makkov-harness:personal:start -->\n- Answer in English.\n<!-- makkov-harness:personal:end -->\n' >> "$proj/AGENTS.md"
bash "$uninst" codex "$proj" >/dev/null
check "copilot keeps its routing block" "[ \"\$(markers '$proj/AGENTS.md')\" = 1 ]"
check "copilot keeps the personal layer" "grep -qx -- '- Answer in English.' '$proj/AGENTS.md'"
check "copilot keeps its skills" "[ -f '$proj/.agents/skills/design-score/SKILL.md' ]"
check "copilot's manifest stays" "[ -f '$proj/.makkov-harness/install-copilot.txt' ]"
bash "$uninst" copilot "$proj" >/dev/null
check "the last uninstall takes the block out" "[ \"\$(markers '$proj/AGENTS.md')\" = 0 ]"
check "and puts your file back byte for byte" "cmp -s '$home/expected' '$proj/AGENTS.md'"
check "the personal layer is kept aside" "grep -qx -- '- Answer in English.' '$proj'/.makkov-harness/backups/*/removed/personal-layer.md"
check "no skills folder left" "[ ! -e '$proj/.agents' ]"
rm -rf "$home" "$proj"

# An update keeps the scope of the earlier install unless --scope is passed again.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, --scope design, then updates"
bash "$inst" codex "$proj" --scope design >/dev/null
check "research and install rows dropped" "! grep -q -e '^| Research, analysis' -e '^| Installing, adding' '$proj/AGENTS.md'"
check "design rows kept" "grep -q '^| A design score' '$proj/AGENTS.md'"
check "the block says it is design-only" "grep -q '^Scope: design work only' '$proj/AGENTS.md'"
bash "$inst" codex "$proj" >/dev/null
check "an update without --scope stays design-only" "grep -q '^Scope: design work only' '$proj/AGENTS.md' && grep -qx 'scope=design' '$proj/.makkov-harness/install-codex.txt'"
bash "$inst" codex "$proj" --scope all >/dev/null
check "--scope all widens it again" "! grep -q '^Scope: design work only' '$proj/AGENTS.md' && grep -q '^| Research, analysis' '$proj/AGENTS.md'"
bash "$uninst" codex "$proj" >/dev/null
rm -rf "$home" "$proj"

# --scope with no value, or a wrong one, prints the usage and changes nothing.
home="$(tmp)"; export HOME="$home"
echo "--scope with no value"
set +e; out="$(bash "$inst" codex --scope 2>&1)"; code=$?; set -e
check "exit code 2" "[ $code = 2 ]"
check "says what --scope takes and prints the usage" "printf '%s' \"\$out\" | grep -q 'all or design' && printf '%s' \"\$out\" | grep -q '^Usage:'"
check "nothing written" "[ -z \"\$(find '$home' -mindepth 1)\" ]"
rm -rf "$home"

# An instructions file that is a symlink stays a symlink, and keeps its mode, through install, update and uninstall.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, AGENTS.md is a symlink"
mkdir "$proj/shared"; printf '# shared notes\n' > "$proj/shared/notes.md"; chmod 644 "$proj/shared/notes.md"; ln -s shared/notes.md "$proj/AGENTS.md"
cp "$proj/shared/notes.md" "$home/expected"
bash "$inst" codex "$proj" >/dev/null
check "still a symlink after the install" "[ -L '$proj/AGENTS.md' ] && grep -q 'makkov-harness:start' '$proj/shared/notes.md'"
echo "update" > "$home/marker"; sed 's/x/x/' "$repo/ROUTING.md" >/dev/null
bash "$inst" codex "$proj" --scope design >/dev/null
check "still a symlink after an update that rewrites the block" "[ -L '$proj/AGENTS.md' ] && grep -q '^Scope: design' '$proj/shared/notes.md'"
check "the file keeps its mode" "[ \"\$(ls -l '$proj/shared/notes.md' | cut -c1-10)\" = '-rw-r--r--' ]"
bash "$uninst" codex "$proj" >/dev/null
check "still a symlink after the uninstall, the file back as it was" "[ -L '$proj/AGENTS.md' ] && cmp -s '$home/expected' '$proj/shared/notes.md'"
rm -rf "$home" "$proj"

# Markers that are not paired: nothing is changed, and the reason is printed.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, a start marker with no end marker"
printf '# a\n<!-- makkov-harness:start -->\nold routing\n# keep me\n' > "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
set +e; out="$(bash "$inst" codex "$proj" 2>&1)"; code=$?; set -e
check "install stops with exit code 1" "[ $code = 1 ]"
check "and says the markers are not paired" "printf '%s' \"\$out\" | grep -q 'not paired'"
check "your file unchanged" "cmp -s '$home/expected' '$proj/AGENTS.md'"
check "no skills copied, no manifest" "[ ! -e '$proj/.agents' ] && [ ! -e '$proj/.makkov-harness' ]"
printf '# a\n' > "$proj/AGENTS.md"; bash "$inst" codex "$proj" >/dev/null
printf '<!-- makkov-harness:personal:start -->\n- mine\n' >> "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
set +e; bash "$uninst" codex "$proj" >/dev/null 2>&1; code=$?; set -e
check "uninstall with an unpaired personal marker stops with exit code 1" "[ $code = 1 ]"
check "and changes nothing" "cmp -s '$home/expected' '$proj/AGENTS.md' && [ -f '$proj/.makkov-harness/install-codex.txt' ] && [ -d '$proj/.agents/skills/design-score' ]"
rm -rf "$home" "$proj"

# A project folder moved or renamed after the install: update and uninstall still find what the install put there.
home="$(tmp)"; parent="$(tmp)"; export HOME="$home"
echo "codex project, folder renamed after the install"
mkdir "$parent/old"; printf '# my notes\n' > "$parent/old/AGENTS.md"; cp "$parent/old/AGENTS.md" "$home/expected"
mkdir -p "$parent/old/.agents/skills/animate"; echo mine > "$parent/old/.agents/skills/animate/SKILL.md"
bash "$inst" codex "$parent/old" >/dev/null
mv "$parent/old" "$parent/new"
bash "$inst" codex "$parent/new" >/dev/null
check "the update recognises our skills (no new backup)" "[ \"\$(ls '$parent/new/.makkov-harness/backups' | grep -v original | wc -l | tr -d ' ')\" = 1 ]"
check "the manifest now names the new folder" "grep -qx \"base=$parent/new\" '$parent/new/.makkov-harness/install-codex.txt'"
mv "$parent/new" "$parent/newer"
bash "$uninst" codex "$parent/newer" >/dev/null
check "skills removed" "[ ! -e '$parent/newer/.agents/skills/design-score' ]"
check "your animate restored" "grep -qx mine '$parent/newer/.agents/skills/animate/SKILL.md'"
check "routing block removed, your file back" "cmp -s '$home/expected' '$parent/newer/AGENTS.md'"
check "no harness folder left" "[ ! -e '$parent/newer/.makkov-harness' ]"
rm -rf "$home" "$parent"

# A skill removed or renamed in a newer version: the update takes the old copy out (or sets it aside if you
# changed it), unless another installed agent still lists it.
src="$(harness_copy)"; home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex and copilot project, skills renamed upstream"
bash "$src/install/install.sh" codex "$proj" >/dev/null
bash "$src/install/install.sh" copilot "$proj" >/dev/null
mv "$src/skills/animate" "$src/skills/animate-renamed"; mv "$src/skills/design-score" "$src/skills/design-score-renamed"
echo "my change" >> "$proj/.agents/skills/design-score/SKILL.md"
bash "$src/install/install.sh" codex "$proj" >/dev/null
check "while copilot still lists them, the old copies stay" "[ -d '$proj/.agents/skills/animate' ] && [ -d '$proj/.agents/skills/design-score' ]"
check "the renamed skills are copied" "[ -d '$proj/.agents/skills/animate-renamed' ]"
bash "$src/install/install.sh" copilot "$proj" >/dev/null
check "the last update takes the unchanged old copy out" "[ ! -e '$proj/.agents/skills/animate' ]"
check "and sets the one you changed aside" "[ ! -e '$proj/.agents/skills/design-score' ] && grep -q 'my change' '$proj'/.makkov-harness/backups/*/removed/design-score/SKILL.md"
check "neither is in a manifest any more" "! grep -q -e '^skill=animate ' -e '^skill=design-score ' '$proj'/.makkov-harness/install-*.txt"
bash "$src/install/uninstall.sh" codex "$proj" >/dev/null; bash "$src/install/uninstall.sh" copilot "$proj" >/dev/null
check "uninstall leaves no skills folder" "[ ! -e '$proj/.agents' ]"
rm -rf "$home" "$proj" "$src"

# Updating in place: a newer copy of the harness replaces the old one without treating it as yours,
# and the uninstall then leaves nothing of either behind.
src="$(harness_copy)"; home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, update in place, then uninstall"
bash "$src/install/install.sh" codex "$proj" >/dev/null
echo "new in this version" > "$src/skills/animate/CHANGES.md"
bash "$src/install/install.sh" codex "$proj" >/dev/null
check "the update replaced our animate" "[ -f '$proj/.agents/skills/animate/CHANGES.md' ]"
check "the update made no backup of ours" "[ ! -e '$proj/.makkov-harness/backups' ] || [ -z \"\$(ls -A '$proj/.makkov-harness/backups')\" ]"
bash "$src/install/uninstall.sh" codex "$proj" >/dev/null
check "nothing of the harness left after uninstall" "[ -z \"\$(find '$proj' -mindepth 1)\" ]"
rm -rf "$home" "$proj"

# An install made before 0.5.0 (no fingerprints in its manifest): its copies are set aside, not restored.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, update over an install from before 0.5.0"
bash "$src/install/install.sh" codex "$proj" >/dev/null
sed 's/^\(skill=[^ ]*\) .*/\1/' "$proj/.makkov-harness/install-codex.txt" | grep -v '^base=' > "$home/m" && cat "$home/m" > "$proj/.makkov-harness/install-codex.txt"
echo "newer still" >> "$src/skills/animate/CHANGES.md"
bash "$src/install/install.sh" codex "$proj" >/dev/null
check "the old copy went to earlier-harness" "ls '$proj'/.makkov-harness/backups/*/earlier-harness/animate >/dev/null 2>&1"
check "nothing went to the restore list" "! grep -q '^backup=' '$proj/.makkov-harness/install-codex.txt'"
bash "$src/install/uninstall.sh" codex "$proj" >/dev/null
check "the uninstall restores no old harness copy" "[ ! -e '$proj/.agents/skills/animate' ]"
rm -rf "$home" "$proj" "$src"

# An install made by the released 0.5.0 installer: this version updates it and uninstalls it cleanly.
old="$(harness_copy)"; cp "$repo/install/test/legacy-0.5.0/install.sh" "$old/install/install.sh"
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex and copilot project installed by 0.5.0, updated and uninstalled by this version"
printf '# my notes\n' > "$proj/AGENTS.md"
mkdir -p "$proj/.agents/skills/animate"; echo mine > "$proj/.agents/skills/animate/SKILL.md"
bash "$old/install/install.sh" codex "$proj" --scope design >/dev/null
bash "$old/install/install.sh" copilot "$proj" --scope design >/dev/null
bash "$inst" codex "$proj" >/dev/null
check "the update keeps the 0.5.0 install's scope" "grep -q '^Scope: design work only' '$proj/AGENTS.md'"
check "the update recognises the 0.5.0 copies (no new backup)" "[ \"\$(ls '$proj/.makkov-harness/backups' | wc -l | tr -d ' ')\" = 1 ]"
bash "$uninst" codex "$proj" >/dev/null
check "copilot (still 0.5.0) keeps its block and skills" "[ \"\$(markers '$proj/AGENTS.md')\" = 1 ] && [ -d '$proj/.agents/skills/design-score' ]"
bash "$uninst" copilot "$proj" >/dev/null
check "skills removed" "[ ! -e '$proj/.agents/skills/design-score' ]"
check "your animate restored" "grep -qx mine '$proj/.agents/skills/animate/SKILL.md'"
check "block removed, your notes as they were" "[ \"\$(cat '$proj/AGENTS.md')\" = '# my notes' ]"
check "no manifest left" "! ls '$proj'/.makkov-harness/install-*.txt >/dev/null 2>&1"
rm -rf "$home" "$proj" "$old"

# Paths with spaces and with [ ] (PowerShell would read [ ] as a wildcard without -LiteralPath).
for name in "My Project" "design [v2]"; do
  home="$(tmp)"; parent="$(tmp)"; proj="$parent/$name"; mkdir -p "$proj/.agents/skills/animate"; export HOME="$home"
  echo mine > "$proj/.agents/skills/animate/SKILL.md"
  echo "codex, project path '$name'"
  bash "$inst" codex "$proj" >/dev/null
  check "installed into the path" "[ -e \"$proj/.agents/skills/design-score/SKILL.md\" ] && [ \"\$(markers \"$proj/AGENTS.md\")\" = 1 ]"
  bash "$inst" codex "$proj" >/dev/null
  check "an update makes no new backup" "[ \"\$(ls \"$proj/.makkov-harness/backups\" | wc -l | tr -d ' ')\" = 1 ]"
  bash "$uninst" codex "$proj" >/dev/null
  check "your animate restored" "grep -qx mine \"$proj/.agents/skills/animate/SKILL.md\""
  check "our skills and block removed" "[ ! -e \"$proj/.agents/skills/design-score\" ] && [ ! -e \"$proj/AGENTS.md\" ]"
  rm -rf "$home" "$parent"
done

# The personal layer harness-onboarding writes: an update keeps it, the uninstall removes it (and keeps a copy).
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project and cursor project, with a personal layer"
printf '# my notes\n' > "$proj/AGENTS.md"
bash "$inst" codex "$proj" >/dev/null
printf '\n<!-- makkov-harness:personal:start -->\n# Personal layer (makkov-harness)\n- Answer in English.\n<!-- makkov-harness:personal:end -->\n' >> "$proj/AGENTS.md"
bash "$inst" codex "$proj" >/dev/null
check "an update keeps the personal layer" "grep -q '^- Answer in English.' '$proj/AGENTS.md'"
bash "$uninst" codex "$proj" >/dev/null
check "the uninstall removes the personal layer" "! grep -q -e 'makkov-harness:personal' -e '^- Answer in English.' '$proj/AGENTS.md'"
check "your notes kept, byte for byte" "[ \"\$(cat '$proj/AGENTS.md')\" = '# my notes' ] && [ \"\$(wc -c < '$proj/AGENTS.md' | tr -d ' ')\" = 11 ]"
bash "$inst" cursor "$proj" >/dev/null
printf -- '---\nalwaysApply: true\n---\n<!-- makkov-harness:personal:start -->\n- Answer in English.\n<!-- makkov-harness:personal:end -->\n' > "$proj/.cursor/rules/makkov-harness-personal.mdc"
bash "$uninst" cursor "$proj" >/dev/null
check "the uninstall removes Cursor's personal rule" "[ ! -e '$proj/.cursor/rules/makkov-harness-personal.mdc' ]"
check "a copy of it is kept aside" "ls '$proj'/.makkov-harness/backups/*/removed/makkov-harness-personal.mdc >/dev/null 2>&1"
check "no empty .cursor folder left" "[ ! -e '$proj/.cursor' ]"
rm -rf "$home" "$proj"

echo
if [ "$fails" = 0 ]; then echo "installer tests: all passed"; else echo "installer tests: $fails failed"; exit 1; fi
