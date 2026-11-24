#!/usr/bin/env bash
# End-to-end test of install.sh and uninstall.sh, in throwaway homes and projects (never your own).
# Each block below states one behaviour the installers promise; install/test/test-install.ps1 checks the same
# behaviours for install.ps1 / uninstall.ps1. Run from anywhere: bash install/test/test-install.sh
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
# MAKKOV_IMPL=node runs every scenario against the Node installer (through install/test/node/, which takes the
# shell installers' command line); the default is install.sh / uninstall.sh.
if [ "${MAKKOV_IMPL:-sh}" = node ]; then ri="install/test/node/install.sh"; ru="install/test/node/uninstall.sh"
else ri="install/install.sh"; ru="install/uninstall.sh"; fi
inst="$repo/$ri"; uninst="$repo/$ru"
expected="$(find "$repo/skills" -mindepth 1 -maxdepth 1 -type d ! -name rich-report | wc -l | tr -d ' ')"
fails=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fails=$((fails + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
markers() { grep -c '<!-- makkov-harness:start -->' "$1" 2>/dev/null || true; }
tmp() { mktemp -d; }
# Every file and link under a folder with its checksum: two equal snapshots mean nothing changed.
snap() { (cd "$1" && find . \( -type f -o -type l \) ! -path './.makkov-harness/install-*' -exec sh -c 'for f; do if [ -L "$f" ]; then echo "$f -> $(readlink "$f")"; else echo "$f $(cksum < "$f")"; fi; done' _ {} + | LC_ALL=C sort); }
# Everything listed under a folder, with checksums: equal listings mean nothing changed, manifests included.
tree() { (cd "$1" && find . -mindepth 1 -exec sh -c 'for f; do if [ -L "$f" ]; then echo "$f -> $(readlink "$f")"; elif [ -f "$f" ]; then echo "$f $(cksum < "$f")"; else echo "$f/"; fi; done' _ {} + | LC_ALL=C sort); }
runs() { set +e; out="$("$@" 2>&1)"; code=$?; set -e; }
root=0; [ "$(id -u)" = 0 ] && root=1
# A copy of the harness to edit (a newer version of a skill, a skill renamed upstream) without touching this one.
harness_copy() { local d; d="$(tmp)"; cp -R "$repo/install" "$repo/skills" "$repo/ROUTING.md" "$repo/bin" "$repo/package.json" "$d/"; echo "$d"; }

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
check "your notes and your later edit kept, block and the blank line before it gone" "[ \"\$(cat '$home/.codex/AGENTS.md')\" = \"\$(printf '# my notes\n# added later')\" ]"
check "the copy of your file as it was stays (it differs from the file now)" "[ \"\$(cat '$home/.makkov-harness/backups/original/.codex/AGENTS.md')\" = '# my notes' ]"
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
check "your notes are still in the file after the install" "grep -qx '# shared notes' '$proj/shared/notes.md'"
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
bash "$src/$ri" codex "$proj" >/dev/null
bash "$src/$ri" copilot "$proj" >/dev/null
mv "$src/skills/animate" "$src/skills/animate-renamed"; mv "$src/skills/design-score" "$src/skills/design-score-renamed"
echo "my change" >> "$proj/.agents/skills/design-score/SKILL.md"
bash "$src/$ri" codex "$proj" >/dev/null
check "while copilot still lists them, the old copies stay" "[ -d '$proj/.agents/skills/animate' ] && [ -d '$proj/.agents/skills/design-score' ]"
check "the renamed skills are copied" "[ -d '$proj/.agents/skills/animate-renamed' ]"
bash "$src/$ri" copilot "$proj" >/dev/null
check "the last update takes the unchanged old copy out" "[ ! -e '$proj/.agents/skills/animate' ]"
check "and sets the one you changed aside" "[ ! -e '$proj/.agents/skills/design-score' ] && grep -q 'my change' '$proj'/.makkov-harness/backups/*/removed/design-score/SKILL.md"
check "neither is in a manifest any more" "! grep -q -e '^skill=animate ' -e '^skill=design-score ' '$proj'/.makkov-harness/install-*.txt"
bash "$src/$ru" codex "$proj" >/dev/null; bash "$src/$ru" copilot "$proj" >/dev/null
check "uninstall leaves no skills folder" "[ ! -e '$proj/.agents' ]"
rm -rf "$home" "$proj" "$src"

# Updating in place: a newer copy of the harness replaces the old one without treating it as yours,
# and the uninstall then leaves nothing of either behind.
src="$(harness_copy)"; home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, update in place, then uninstall"
bash "$src/$ri" codex "$proj" >/dev/null
echo "new in this version" > "$src/skills/animate/CHANGES.md"
bash "$src/$ri" codex "$proj" >/dev/null
check "the update replaced our animate" "[ -f '$proj/.agents/skills/animate/CHANGES.md' ]"
check "the update made no backup of ours" "[ ! -e '$proj/.makkov-harness/backups' ] || [ -z \"\$(ls -A '$proj/.makkov-harness/backups')\" ]"
bash "$src/$ru" codex "$proj" >/dev/null
check "nothing of the harness left after uninstall" "[ -z \"\$(find '$proj' -mindepth 1)\" ]"
rm -rf "$home" "$proj"

# An install made before 0.5.0 (no fingerprints in its manifest): its copies are set aside, not restored.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, update over an install from before 0.5.0"
bash "$src/$ri" codex "$proj" >/dev/null
sed 's/^\(skill=[^ ]*\) .*/\1/' "$proj/.makkov-harness/install-codex.txt" | grep -v '^base=' > "$home/m" && cat "$home/m" > "$proj/.makkov-harness/install-codex.txt"
echo "newer still" >> "$src/skills/animate/CHANGES.md"
bash "$src/$ri" codex "$proj" >/dev/null
check "the old copy went to earlier-harness" "ls '$proj'/.makkov-harness/backups/*/earlier-harness/animate >/dev/null 2>&1"
check "nothing went to the restore list" "! grep -q '^backup=' '$proj/.makkov-harness/install-codex.txt'"
bash "$src/$ru" codex "$proj" >/dev/null
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
  # Two agents sharing the skills folder and AGENTS.md, from a folder where a file named like the path's first word exists.
  printf 'mine\n' > "$parent/${name%% *}"; cp "$parent/${name%% *}" "$home/word"
  bash "$inst" codex "$proj" >/dev/null; bash "$inst" copilot "$proj" >/dev/null
  runs bash -c "cd '$parent' && bash '$uninst' codex '$proj'"
  check "codex uninstalls while copilot shares the folder" "[ $code = 0 ] && [ -d \"$proj/.agents/skills/design-score\" ]"
  bash "$uninst" copilot "$proj" >/dev/null 2>&1 || true
  check "then copilot; nothing outside the project touched" "cmp -s '$home/word' \"$parent/${name%% *}\" && [ ! -e \"$proj/.makkov-harness\" ] && [ ! -e \"$proj/AGENTS.md\" ]"
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


# A first install that cannot finish stops before it changes anything.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, AGENTS.md is a folder"
mkdir -p "$proj/AGENTS.md" "$proj/.agents/skills/animate"; echo mine > "$proj/.agents/skills/animate/SKILL.md"
before="$(tree "$proj")"
runs bash "$inst" codex "$proj"
check "install stops with exit code 1 and says why" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'not a regular file'"
check "nothing changed: no skills, no backup, no manifest" "[ \"\$(tree '$proj')\" = \"\$before\" ]"
rm -rf "$home" "$proj"
if [ "$root" = 1 ]; then echo "codex project, read-only AGENTS.md"; echo "  skip (running as root, which can write a read-only file)"; else
  home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
  echo "codex project, read-only AGENTS.md"
  printf '# mine\n' > "$proj/AGENTS.md"; chmod 444 "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
  before="$(tree "$proj")"
  runs bash "$inst" codex "$proj"
  check "install stops with exit code 1 and says why" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'read-only'"
  check "nothing changed" "[ \"\$(tree '$proj')\" = \"\$before\" ]"
  chmod 644 "$proj/AGENTS.md"
  bash "$inst" codex "$proj" >/dev/null && bash "$uninst" codex "$proj" >/dev/null
  check "once writable, install and uninstall put it back as it was" "cmp -s '$home/expected' '$proj/AGENTS.md' && [ ! -e '$proj/.makkov-harness' ]"
  rm -rf "$home" "$proj"
fi

# An interrupted install (the run stops after the skills, or after the file) can be uninstalled at once, or run
# again and then uninstalled; either way your skill and your file come back as they were.
for stop_at in skills rules; do
  for then in uninstall rerun; do
    home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
    echo "codex project, install stopped after the $stop_at step, then $then"
    printf '# mine' > "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
    mkdir -p "$proj/.agents/skills/animate"; echo mine > "$proj/.agents/skills/animate/SKILL.md"
    set +e; MAKKOV_HARNESS_TEST=1 MAKKOV_HARNESS_TEST_STOP=$stop_at bash "$inst" codex "$proj" >/dev/null 2>&1; set -e
    check "a manifest is there after the interruption" "[ -f '$proj/.makkov-harness/install-codex.txt' ]"
    [ "$then" = rerun ] && bash "$inst" codex "$proj" >/dev/null
    bash "$uninst" codex "$proj" >/dev/null
    check "your animate is back" "grep -qx mine '$proj/.agents/skills/animate/SKILL.md'"
    check "your file is back byte for byte" "cmp -s '$home/expected' '$proj/AGENTS.md'"
    check "nothing of the harness left" "[ ! -e '$proj/.makkov-harness' ] && [ \"\$(ls '$proj/.agents/skills')\" = animate ]"
    rm -rf "$home" "$proj"
  done
done

# Your file's bytes pass through as they are: another encoding, a byte order mark, edited after the install.
# A UTF-16 file is not rewritten at all.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, a Windows-1251 file and a UTF-8 file with a BOM, edited after the install"
for kind in cp1251 bom; do
  if [ "$kind" = cp1251 ]; then printf '# \xcf\xf0\xe8\xe2\xe5\xf2\r\n' > "$proj/AGENTS.md"; else printf '\xef\xbb\xbf# notes \xe2\x80\x94 mine\n' > "$proj/AGENTS.md"; fi
  cp "$proj/AGENTS.md" "$home/expected"
  bash "$inst" codex "$proj" >/dev/null; bash "$inst" codex "$proj" --scope design >/dev/null
  check "$kind: your bytes are unchanged at the top of the file" "[ \"\$(head -c \$(wc -c < '$home/expected') '$proj/AGENTS.md' | od -An -tx1)\" = \"\$(od -An -tx1 < '$home/expected')\" ]"
  printf 'added\n' >> "$proj/AGENTS.md"
  bash "$uninst" codex "$proj" >/dev/null
  check "$kind: after the uninstall your bytes and your edit are there" "[ \"\$(od -An -tx1 < '$proj/AGENTS.md')\" = \"\$( { cat '$home/expected'; printf 'added\n'; } | od -An -tx1)\" ]"
  rm -rf "$proj/.makkov-harness"
done
printf '\xff\xfe#\x00 \x00m\x00\n\x00' > "$proj/AGENTS.md"; before="$(tree "$proj")"
runs bash "$inst" codex "$proj"
check "a UTF-16 file: install stops with exit code 1 and says why" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'UTF-16'"
check "and changes nothing" "[ \"\$(tree '$proj')\" = \"\$before\" ]"
rm -rf "$home" "$proj"

# A manifest is not trusted: one that points outside the folder, or names paths the installer would not use,
# stops install and uninstall before any change.
for tamper in rules skill created backup empty; do
  home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
  echo "codex project, manifest edited: $tamper"
  echo PRECIOUS > "$home/precious.txt"; mkdir -p "$home/outside/keep"
  bash "$inst" codex "$proj" >/dev/null
  mf="$proj/.makkov-harness/install-codex.txt"
  case "$tamper" in
    rules)   sed "s#^rules=.*#rules=$home/precious.txt#" "$mf" > "$home/m" ;;
    skill)   { cat "$mf"; echo "skill=../../../outside 123"; } > "$home/m" ;;
    created) { cat "$mf"; echo "created_dir=../outside"; } > "$home/m" ;;
    backup)  { cat "$mf"; echo "backup=$home/outside"; } > "$home/m" ;;
    empty)   : > "$home/m" ;;
  esac
  cat "$home/m" > "$mf"
  before="$(tree "$proj")"
  runs bash "$uninst" codex "$proj"
  check "uninstall stops with exit code 1 and says the manifest is not one it wrote" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'does not look like a manifest'"
  check "nothing changed in the project or outside it" "[ \"\$(tree '$proj')\" = \"\$before\" ] && grep -qx PRECIOUS '$home/precious.txt' && [ -d '$home/outside/keep' ]"
  runs bash "$inst" codex "$proj"
  check "install stops too" "[ $code = 1 ] && [ \"\$(tree '$proj')\" = \"\$before\" ]"
  rm -rf "$home" "$proj"
done

# A file that already holds a marked block (an example in your notes, or a teammate's committed file) is kept as
# it was before the install, and the copy stays after the uninstall, since the file then differs from it.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, your file already has a marked block"
printf '# doc\n<!-- makkov-harness:start -->\nMY EXAMPLE TEXT\n<!-- makkov-harness:end -->\nafter\n' > "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
bash "$inst" codex "$proj" >/dev/null
check "a copy of your file as it was, block and all" "cmp -s '$home/expected' '$proj/.makkov-harness/backups/original/AGENTS.md'"
runs bash "$uninst" codex "$proj"
check "the copy stays after the uninstall, and the uninstall says where" "cmp -s '$home/expected' '$proj/.makkov-harness/backups/original/AGENTS.md' && printf '%s' \"\$out\" | grep -q 'is kept in'"
rm -rf "$home" "$proj"

# A symlink to a file that does not exist: nothing is created outside the project, and the link is not deleted.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, AGENTS.md is a dangling symlink"
ln -s "$home/target.md" "$proj/AGENTS.md"; before="$(tree "$proj")"
runs bash "$inst" codex "$proj"
check "install stops with exit code 1 and says why" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'does not exist'"
check "nothing changed, and no target created" "[ \"\$(tree '$proj')\" = \"\$before\" ] && [ ! -e '$home/target.md' ]"
rm -rf "$home" "$proj"

# A file of blank lines and spaces comes back as it was.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, a file of whitespace only"
printf '  \n\n\t\n' > "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
bash "$inst" codex "$proj" >/dev/null; bash "$uninst" codex "$proj" >/dev/null
check "put back byte for byte" "cmp -s '$home/expected' '$proj/AGENTS.md' && [ ! -e '$proj/.makkov-harness' ]"
rm -rf "$home" "$proj"

# An uninstall that cannot finish stops before it changes anything, and works once it can.
if [ "$root" = 1 ]; then echo "codex project, uninstall with a read-only AGENTS.md"; echo "  skip (running as root, which can write a read-only file)"; else
  home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
  echo "codex project, uninstall with a read-only AGENTS.md"
  printf '# mine\n' > "$proj/AGENTS.md"; cp "$proj/AGENTS.md" "$home/expected"
  mkdir -p "$proj/.agents/skills/animate"; echo mine > "$proj/.agents/skills/animate/SKILL.md"
  bash "$inst" codex "$proj" >/dev/null; chmod 444 "$proj/AGENTS.md"; before="$(tree "$proj")"
  runs bash "$uninst" codex "$proj"
  check "uninstall stops with exit code 1 and changes nothing" "[ $code = 1 ] && [ \"\$(tree '$proj')\" = \"\$before\" ]"
  chmod 644 "$proj/AGENTS.md"; bash "$uninst" codex "$proj" >/dev/null
  check "once writable, the uninstall puts back your file and your animate" "cmp -s '$home/expected' '$proj/AGENTS.md' && grep -qx mine '$proj/.agents/skills/animate/SKILL.md' && [ ! -e '$proj/.makkov-harness' ]"
  rm -rf "$home" "$proj"
fi

# A skill another agent's newer install updated is still the harness's own when the older agent goes last.
src="$(harness_copy)"; home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex from an older copy, copilot from a newer one, uninstalled copilot first"
bash "$src/$ri" codex "$proj" >/dev/null
echo "newer" > "$src/skills/animate/CHANGES.md"
bash "$src/$ri" copilot "$proj" >/dev/null
bash "$src/$ru" copilot "$proj" >/dev/null
bash "$inst" codex "$proj" --dry-run >/dev/null
bash "$uninst" codex "$proj" >/dev/null
check "nothing taken for yours, nothing left" "[ -z \"\$(find '$proj' -mindepth 1)\" ]"
rm -rf "$home" "$proj" "$src"

# Agents without skills (Aider) next to agents with them; and a project path that is your home folder.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "aider and codex in one project"
bash "$inst" aider "$proj" >/dev/null
runs bash "$inst" codex "$proj"
check "codex installs next to aider" "[ $code = 0 ] && [ -d '$proj/.agents/skills/design-score' ]"
bash "$uninst" codex "$proj" >/dev/null; bash "$uninst" aider "$proj" >/dev/null
check "both uninstall, nothing left" "[ -z \"\$(find '$proj' -mindepth 1)\" ]"
echo "codex with the home folder as the project path"
runs bash "$inst" codex "$home"
check "install stops with exit code 2 and says why" "[ $code = 2 ] && printf '%s' \"\$out\" | grep -q 'home folder'"
check "nothing written" "[ -z \"\$(find '$home' -mindepth 1)\" ]"
rm -rf "$home" "$proj"

# Several agents in one folder, uninstalled in any order: no later install or uninstall is refused, and a folder
# that had no AGENTS.md has none afterwards (project and user level).
for level in project home; do
  for order in "codex copilot cline" "cline codex copilot" "copilot cline codex"; do
    home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
    if [ "$level" = home ]; then set -- codex cline gemini; p=""; b="$home"; else set -- codex copilot cline; p="$proj"; b="$proj"; fi
    agents="$*"
    echo "$level: install $agents, uninstall in the order of: $order"
    for a in $agents; do bash "$inst" "$a" $p >/dev/null; done
    okall=1; i=0
    for a in $order; do
      case "$level:$a" in home:copilot) a=gemini ;; esac
      runs bash "$uninst" "$a" $p; [ "$code" = 0 ] || okall=0
      i=$((i + 1)); [ "$i" = 1 ] && { runs bash "$inst" "$a" $p; [ "$code" = 0 ] || okall=0; runs bash "$uninst" "$a" $p; [ "$code" = 0 ] || okall=0; }
    done
    check "every uninstall and the reinstall in between went through" "[ $okall = 1 ]"
    check "nothing left, no AGENTS.md made up" "[ -z \"\$(find '$b' -mindepth 1)\" ]"
    rm -rf "$home" "$proj"
  done
done
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex and copilot, no AGENTS.md before: the second install does not take the harness's file for yours"
bash "$inst" codex "$proj" --scope design >/dev/null; bash "$inst" copilot "$proj" >/dev/null; bash "$inst" codex "$proj" >/dev/null
check "no copy of a file you never had" "[ ! -e '$proj/.makkov-harness/backups/original' ]"
bash "$uninst" copilot "$proj" >/dev/null; bash "$uninst" codex "$proj" >/dev/null
check "nothing left" "[ -z \"\$(find '$proj' -mindepth 1)\" ]"
rm -rf "$home" "$proj"

# Interrupted after the first skill is in place: a skill of yours the run did not reach is not taken for ours,
# and no half-made copy is left behind.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, install stopped after the first skill, your style-sampling not reached yet"
mkdir -p "$proj/.agents/skills/style-sampling"; echo MINE > "$proj/.agents/skills/style-sampling/SKILL.md"
mkdir -p "$proj/.agents/skills/.mh-tmp-animate"; echo half > "$proj/.agents/skills/.mh-tmp-animate/x"
set +e; MAKKOV_HARNESS_TEST=1 MAKKOV_HARNESS_TEST_STOP=skill bash "$inst" codex "$proj" >/dev/null 2>&1; set -e
check "your style-sampling is still where it was" "grep -qx MINE '$proj/.agents/skills/style-sampling/SKILL.md'"
bash "$uninst" codex "$proj" >/dev/null
check "after the uninstall it is still yours and in place" "grep -qx MINE '$proj/.agents/skills/style-sampling/SKILL.md' && [ ! -e '$proj/.makkov-harness' ]"
check "no half-made copies left" "[ \"\$(ls -A '$proj/.agents/skills')\" = style-sampling ]"
echo "the test hook needs MAKKOV_HARNESS_TEST=1"
rm -rf "$proj/.agents"
MAKKOV_HARNESS_TEST_STOP=skills bash "$inst" codex "$proj" >/dev/null
check "without it, the install runs to the end" "grep -q '^rules=' '$proj/.makkov-harness/install-codex.txt' && [ \"\$(sed -n 's/^skill=\\([^ ]*\\).*/\\1/p' '$proj/.makkov-harness/install-codex.txt' | sort -u | wc -l | tr -d ' ')\" = $expected ]"
bash "$uninst" codex "$proj" >/dev/null
rm -rf "$home" "$proj"

# An edit of only whitespace or line ends after the install is yours, and stays.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, you change only line ends and trailing spaces after the install"
printf '# mine\r\nline  \r\n' > "$proj/AGENTS.md"
bash "$inst" codex "$proj" >/dev/null
sed 's/\r$//; s/line  $/line/' "$proj/AGENTS.md" > "$home/edited"; cat "$home/edited" > "$proj/AGENTS.md"
bash "$uninst" codex "$proj" >/dev/null
check "your LF line ends and trimmed line stay" "[ \"\$(od -An -tx1 < '$proj/AGENTS.md')\" = \"\$(printf '# mine\nline\n' | od -An -tx1)\" ]"
rm -rf "$home" "$proj"

# A file where a skill folder goes stops the install before any change.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, a file named like a skill folder"
mkdir -p "$proj/.agents/skills"; echo x > "$proj/.agents/skills/html-report"; before="$(tree "$proj")"
runs bash "$inst" codex "$proj"
check "install stops with exit code 1, names the file, changes nothing" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'is a file' && [ \"\$(tree '$proj')\" = \"\$before\" ]"
rm -rf "$home" "$proj"

# Two agents with different skills folders installed in the same second each keep their own backup folder: your
# skill moved aside by one is put back into that one's skills folder, never into the other's.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"; shim="$(tmp)"
printf '#!/bin/sh\necho 20260101-000000\n' > "$shim/date"; chmod +x "$shim/date"
echo "two agents installed in the same second"
mkdir -p "$proj/.agents/skills/animate"; echo mine > "$proj/.agents/skills/animate/SKILL.md"
before="$(tree "$proj")"
# (The shim names the second for install.sh; MAKKOV_HARNESS_TEST_STAMP for the Node installer.)
export MAKKOV_HARNESS_TEST_STAMP=20260101-000000
PATH="$shim:$PATH" bash "$inst" codex "$proj" >/dev/null; PATH="$shim:$PATH" bash "$inst" cline "$proj" >/dev/null
check "the backup folder is named for the agent" "[ -f '$proj/.makkov-harness/backups/20260101-000000-codex/skills/animate/SKILL.md' ]"
PATH="$shim:$PATH" bash "$uninst" cline "$proj" >/dev/null; PATH="$shim:$PATH" bash "$uninst" codex "$proj" >/dev/null
check "your animate is back where it was, nothing else left" "[ \"\$(tree '$proj')\" = \"\$before\" ]"
rm -rf "$home" "$proj" "$shim"; unset MAKKOV_HARNESS_TEST_STAMP

# A hard-linked instructions file stays one file under both names: it is written in place, not replaced.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, AGENTS.md hard-linked to a file outside the project"
printf '# mine\n' > "$proj/AGENTS.md"; ln "$proj/AGENTS.md" "$home/linked.md"; cp "$proj/AGENTS.md" "$home/expected"
bash "$inst" codex "$proj" >/dev/null
check "still one file under both names, with the routing block" "[ '$proj/AGENTS.md' -ef '$home/linked.md' ] && [ \"\$(markers '$home/linked.md')\" = 1 ]"
bash "$uninst" codex "$proj" >/dev/null
check "after the uninstall, still linked and as it was" "[ '$proj/AGENTS.md' -ef '$home/linked.md' ] && cmp -s '$home/expected' '$home/linked.md'"
rm -rf "$home" "$proj"

# The instructions file's folder must be writable (the file is replaced through a temporary file next to it).
if [ "$root" = 0 ]; then
  home="$(tmp)"; export HOME="$home"
  echo "gemini user level, ~/.gemini is read-only"
  mkdir -p "$home/.gemini"; printf '# mine\n' > "$home/.gemini/GEMINI.md"; chmod a-w "$home/.gemini"; before="$(tree "$home")"
  runs bash "$inst" gemini
  check "install stops with exit code 1, says why, changes nothing" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'read-only' && [ \"\$(tree '$home')\" = \"\$before\" ]"
  chmod u+w "$home/.gemini"; rm -rf "$home"
else echo "gemini user level, ~/.gemini is read-only: skip (running as root, every folder is writable)"; fi

# A link left under a temporary name is removed as a link: the folder it points to keeps its files.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, a symlink to a folder of yours left as .mh-tmp-animate"
mkdir -p "$home/target" "$proj/.agents/skills"; echo keep > "$home/target/file"; ln -s "$home/target" "$proj/.agents/skills/.mh-tmp-animate"
bash "$inst" codex "$proj" >/dev/null; bash "$uninst" codex "$proj" >/dev/null
check "the link is gone, the folder it pointed to is untouched" "[ ! -e '$proj/.agents/skills/.mh-tmp-animate' ] && [ ! -L '$proj/.agents/skills/.mh-tmp-animate' ] && grep -qx keep '$home/target/file'"
rm -rf "$home" "$proj"

# A home folder path spelled with a trailing slash: the manifest names one spelling, and update and uninstall read
# it back (the Node installer once wrote both spellings, and then refused its own manifest).
t="$(tmp)"; mkdir -p "$t/home/.codex"; printf '# my notes\n' > "$t/home/.codex/AGENTS.md"; export HOME="$t/home/"
echo "codex at user level, the home folder given with a trailing slash"
before="$(tree "$t/home")"
runs bash "$inst" codex; c1=$code; runs bash "$inst" codex; c2=$code; runs bash "$uninst" codex; c3=$code
check "install, update and uninstall all go through" "[ $c1 = 0 ] && [ $c2 = 0 ] && [ $c3 = 0 ]"
check "the home folder is as it was" "[ \"\$(tree '$t/home')\" = \"\$before\" ]"
rm -rf "$t"

# A home folder given as a relative path (HOME=home, run from the folder above it): install, update and uninstall
# read back what they wrote, and the home folder ends as it began.
t="$(tmp)"; mkdir -p "$t/home/.codex"; printf '# my notes\n' > "$t/home/.codex/AGENTS.md"
echo "codex at user level, the home folder given as a relative path"
before="$(tree "$t/home")"
rc() { (cd "$t" && HOME=home bash "$@" >/dev/null 2>&1); echo $?; }
c1="$(rc "$inst" codex)"; c2="$(rc "$inst" codex)"; c3="$(rc "$uninst" codex)"
check "install, update and uninstall all go through" "[ $c1 = 0 ] && [ $c2 = 0 ] && [ $c3 = 0 ]"
check "the home folder is as it was" "[ \"\$(tree '$t/home')\" = \"\$before\" ]"
rm -rf "$t"

# A home folder that is a symlink, and the project path given as the folder it points to: still the home folder.
t="$(tmp)"; mkdir -p "$t/real"; ln -s "$t/real" "$t/home"; export HOME="$t/home"
echo "codex with the project path the real folder of a symlinked home"
runs bash "$inst" codex "$t/real"
check "install stops with exit code 2 and says why" "[ $code = 2 ] && printf '%s' \"\$out\" | grep -q 'home folder'"
check "nothing written" "[ -z \"\$(find '$t/real' -mindepth 1)\" ]"
rm -rf "$t"

# A skills folder on another file system (.agents a link to /dev/shm): your skill is moved aside and put back
# by copying, and nothing is left on either side.
shm=""; if [ -d /dev/shm ] && [ -w /dev/shm ]; then shm="$(mktemp -d /dev/shm/mh-test.XXXXXX)"; fi
if [ -n "$shm" ] && [ "$(df -P "$shm" | awk 'NR==2 {print $1}')" != "$(df -P "$(tmp)" | awk 'NR==2 {print $1}')" ]; then
  home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
  echo "codex project, .agents on another file system (a link to /dev/shm)"
  mkdir -p "$shm/skills/animate"; echo mine > "$shm/skills/animate/SKILL.md"; ln -s "$shm" "$proj/.agents"
  before="$(tree "$shm")"
  runs bash "$inst" codex "$proj"; c1=$code
  check "install goes through, your animate set aside" "[ $c1 = 0 ] && grep -qx mine '$proj'/.makkov-harness/backups/*/skills/animate/SKILL.md"
  runs bash "$uninst" codex "$proj"
  check "uninstall goes through and puts your animate back" "[ $code = 0 ] && [ \"\$(tree '$shm')\" = \"\$before\" ] && [ ! -e '$proj/.makkov-harness' ]"
  rm -rf "$home" "$proj"
else echo "codex project, .agents on another file system: skip (no /dev/shm on another file system here)"; fi
[ -n "$shm" ] && rm -rf "$shm"

# One run at a time: a lock another running process holds stops the run before any change; a lock left by a run
# that was stopped is taken over; four installs started at once leave your skill where an uninstall puts it back.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, a lock held by a running process"
mkdir -p "$proj/.makkov-harness/lock"; printf 'pid=%s\nhost=%s\nstarted=%s\nby=test\n' "$$" "$(hostname 2>/dev/null || uname -n)" "$(date +%s)" > "$proj/.makkov-harness/lock/owner"
before="$(tree "$proj")"
runs bash "$inst" codex "$proj"
check "install stops with exit code 1, says another run is working, changes nothing" "[ $code = 1 ] && printf '%s' \"\$out\" | grep -q 'Another makkov-harness run' && [ \"\$(tree '$proj')\" = \"\$before\" ]"
echo "codex project, a lock left by a run that was stopped"
sh -c 'exit 0' & dead=$!; wait "$dead" || true
printf 'pid=%s\nhost=%s\nstarted=%s\nby=test\n' "$dead" "$(hostname 2>/dev/null || uname -n)" "$(date +%s)" > "$proj/.makkov-harness/lock/owner"
runs bash "$inst" codex "$proj"; c1=$code; runs bash "$uninst" codex "$proj"
check "it is taken over: install and uninstall go through, nothing left" "[ $c1 = 0 ] && [ $code = 0 ] && [ -z \"\$(find '$proj' -mindepth 1)\" ]"
rm -rf "$home" "$proj"
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "codex project, four installs started at once"
mkdir -p "$proj/.agents/skills/animate"; echo mine > "$proj/.agents/skills/animate/SKILL.md"; before="$(tree "$proj")"
for i in 1 2 3 4; do bash "$inst" codex "$proj" > "$home/run$i" 2>&1 & done; wait || true
ok4=1; for i in 1 2 3 4; do grep -q 'makkov-harness installed for codex\|Another makkov-harness run' "$home/run$i" || ok4=0; done
check "each run either installs or says another run is working (no stack trace)" "[ $ok4 = 1 ] && ! grep -q 'at \|Error:' '$home'/run*"
[ "$ok4" = 1 ] || for i in 1 2 3 4; do echo "    run $i said:"; sed 's/^/      /' "$home/run$i"; done
runs bash "$uninst" codex "$proj"
check "the uninstall puts your animate back and leaves nothing else" "[ $code = 0 ] && [ \"\$(tree '$proj')\" = \"\$before\" ]"
rm -rf "$home" "$proj"

# A manifest written by install.ps1 (a BOM, CRLF line ends, Windows paths) is read by the bash installer.
home="$(tmp)"; proj="$(tmp)"; export HOME="$home"
echo "a manifest in install.ps1's form"
. "$repo/install/lib.sh"
check "Windows paths read in Git Bash form" "[ \"\$(printf 'base=C:\\\\Users\\\\me\\\\p\r\nagent=codex\r\n' > '$home/m'; MH_DRV=/; mh_raw '$home/m' base)\" = /c/Users/me/p ]"
check "and in WSL form" "[ \"\$(MH_DRV=/mnt/; mh_raw '$home/m' base)\" = /mnt/c/Users/me/p ]"
check "agent read without its carriage return" "[ \"\$(mh_raw '$home/m' agent)\" = codex ]"
bash "$inst" codex "$proj" >/dev/null
mf="$proj/.makkov-harness/install-codex.txt"
{ printf '\357\273\277'; sed 's/$/\r/' "$mf"; } > "$home/m2"; cat "$home/m2" > "$mf"
runs bash "$uninst" codex "$proj"
check "the uninstall accepts it and removes everything" "[ $code = 0 ] && [ -z \"\$(find '$proj' -mindepth 1)\" ]"
rm -rf "$home" "$proj"

# Random sequences of install, update and uninstall for several agents, with interruptions: a bounded run here
# (seeded by the day, printed, so a failure can be re-run with the same seed); run more locally.
echo "random sequences"
seq_seed="${MAKKOV_SEQ_SEED:-$(date +%j | sed 's/^0*//')}"
if bash "$repo/install/test/test-sequences.sh" "${MAKKOV_SEQ_RUNS:-12}" "$seq_seed"; then ok "random sequences (seed $seq_seed)"; else bad "random sequences (seed $seq_seed)"; fi

echo
if [ "$fails" = 0 ]; then echo "installer tests: all passed"; else echo "installer tests: $fails failed"; exit 1; fi
