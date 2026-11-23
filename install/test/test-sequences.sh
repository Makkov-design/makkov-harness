#!/usr/bin/env bash
# Randomized sequences of install, update and uninstall, for several agents at once, with interruptions.
# After everything is uninstalled, the folder must be exactly as it was at the start (every file, byte for byte,
# and no folder added or removed), and nothing outside it may have changed. Seeded, so a failure can be re-run.
#
# Usage: bash install/test/test-sequences.sh [sequences] [seed]
#   MAKKOV_TEST_KILL=1   also kill runs with kill -9 at a random moment (timing-dependent; for local runs)
#   MAKKOV_IMPL=sh       install.sh / uninstall.sh (the default)
#   MAKKOV_IMPL=node     the Node installer (bin/makkov-harness.mjs)
#   MAKKOV_NODE_BIN=…    the Node installer to run (default: this repository's bin/makkov-harness.mjs)
#   MAKKOV_IMPL=mixed    each step by one of them picked at random, and by install.ps1 / uninstall.ps1 too when
#                        PowerShell 7 (pwsh) is installed: the same folder, worked on by every implementation
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
impl="${MAKKOV_IMPL:-sh}"
case "$impl" in sh) impls=(sh) ;; node) impls=(node) ;; mixed) impls=(sh node); case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) impls+=(ps) ;; *) command -v pwsh >/dev/null 2>&1 && impls+=(ps) ;; esac ;;
  *) echo "MAKKOV_IMPL is sh, node or mixed" >&2; exit 2 ;; esac
# In Git Bash on Windows, Node and PowerShell get Windows paths (C:\...), and their home is USERPROFILE.
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) winpath() { cygpath -w "$1"; }; ps_exe="$(command -v pwsh || command -v powershell)" ;;
  *) winpath() { printf '%s' "$1"; }; ps_exe="$(command -v pwsh || true)" ;; esac
# MAKKOV_NODE_BIN: the Node installer to run, e.g. bin/makkov-harness.mjs of the npm package unpacked from
# `npm pack` (its skills miss the files npm never packs, such as a .gitignore); this repository's by default.
node_bin="${MAKKOV_NODE_BIN:-$repo/bin/makkov-harness.mjs}"
# PowerShell keeps caches in its own $HOME (.cache, .local): a folder of its own, outside the folders compared, so
# they are not taken for something an installer left. install.ps1 reads USERPROFILE, the test's home.
ps_home="$(mktemp -d)"; trap 'rm -rf "$ps_home"' EXIT
# The command line of one run: <impl> install|uninstall <agent> [project] [--scope design]
run_cmd() {
  local i="$1" op="$2" a="$3" pr="$4" sc="$5" wp=""
  [ -n "$pr" ] && wp="$(winpath "$pr")"
  case "$i" in
    sh)   cmd=(bash "$repo/install/$op.sh" "$a"); [ -n "$pr" ] && cmd+=("$pr"); [ -n "$sc" ] && cmd+=(--scope "$sc") ;;
    node) cmd=(env "USERPROFILE=$(winpath "$HOME")" node "$(winpath "$node_bin")" "$op" --agent "$a"); [ -n "$pr" ] && cmd+=(--project "$wp"); [ -n "$sc" ] && cmd+=(--scope "$sc") ;;
    ps)   cmd=(env "USERPROFILE=$(winpath "$HOME")" "HOME=$ps_home" POWERSHELL_TELEMETRY_OPTOUT=1 "$ps_exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$(winpath "$repo/install/$op.ps1")" -Agent "$a"); [ -n "$pr" ] && cmd+=(-Project "$wp"); [ -n "$sc" ] && cmd+=(-Scope "$sc") ;;
  esac
  return 0
}
runs_total="${1:-20}" seed="${2:-1}"
RANDOM="$seed"
pick() { local a=("$@"); printf '%s' "${a[$((RANDOM % ${#a[@]}))]}"; }
# Everything under a folder, with checksums of files and targets of links.
tree() { (cd "$1" && find . -mindepth 1 -exec sh -c 'for f; do if [ -L "$f" ]; then echo "$f -> $(readlink "$f")"; elif [ -f "$f" ]; then echo "$f $(cksum < "$f")"; else echo "$f/"; fi; done' _ {} + | LC_ALL=C sort); }
# On a failure: the steps, then what each run printed.
fail() { echo "FAIL (sequence $n, seed $seed): $*"; echo "steps:"; printf '%s' "$log"; echo "what each run printed:"; printf '%s\n' "$said"; exit 1; }

for n in $(seq 1 "$runs_total"); do
  parent="$(mktemp -d)"
  name="$(pick plain 'My Project' 'design [v2]')"
  level="$(pick project home)"
  if [ "$level" = project ]; then
    home="$parent/home"; base="$parent/$name"; p="$base"
    pool=(codex copilot cline cursor gemini windsurf aider)
  else
    home="$parent/$name"; base="$home"; p=""
    pool=(codex cline gemini opencode)
  fi
  mkdir -p "$home" "$base"; export HOME="$home"
  # Three agents from the pool.
  agents=(); while [ "${#agents[@]}" -lt 3 ]; do a="$(pick "${pool[@]}")"; case " ${agents[*]-} " in *" $a "*) ;; *) agents+=("$a") ;; esac; done
  # What the person had before: maybe an AGENTS.md (with or without a final newline, maybe CRLF), maybe a skill
  # of their own with one of the harness's names, maybe a GEMINI.md.
  rules_dir="$base"; [ "$level" = home ] && rules_dir="$home/.codex"
  case $((RANDOM % 4)) in
    0) mkdir -p "$rules_dir"; printf '# my notes\n' > "$rules_dir/AGENTS.md" ;;
    1) mkdir -p "$rules_dir"; printf '# my notes\r\nno newline at the end' > "$rules_dir/AGENTS.md" ;;
    2) mkdir -p "$rules_dir"; printf '  \n\n' > "$rules_dir/AGENTS.md" ;;
  esac
  [ $((RANDOM % 2)) = 0 ] && { mkdir -p "$base/.agents/skills/animate"; echo mine > "$base/.agents/skills/animate/SKILL.md"; }
  [ "$level" = project ] && [ $((RANDOM % 3)) = 0 ] && printf 'gemini notes\n' > "$base/GEMINI.md"
  # Files outside the folder that a split or globbed path would hit.
  printf 'outside\n' > "$parent/${name%% *}x"; printf 'outside\n' > "$parent/My"
  start="$(tree "$base")"; outside="$(cd "$parent" && ls -la | grep -v -e ' \.$' -e ' \.\.$' -e " ${name%% *}" | awk '{print $1, $5, $NF}'; cksum "$parent/My" "$parent/${name%% *}x")"
  log="" said=""
  for step in 1 2 3 4 5 6 7 8; do
    a="$(pick "${agents[@]}")"
    case "$a" in cursor|copilot|windsurf|aider) [ -n "$p" ] || continue ;; esac
    im="$(pick "${impls[@]}")"
    op="$(pick install install update uninstall uninstall)"
    stop=""; [ $((RANDOM % 4)) = 0 ] && stop=yes
    sc=""
    if [ "$op" = uninstall ]; then run_cmd "$im" uninstall "$a" "$p" ""; points=(u-skills u-rules)
      [ -f "$base/.makkov-harness/install-$a.txt" ] || continue
    else [ "$op" = update ] && [ $((RANDOM % 2)) = 0 ] && sc=design
      run_cmd "$im" install "$a" "$p" "$sc"; points=(skill skills rules)
    fi
    how="normal"
    set +e
    if [ -n "$stop" ] && [ "${MAKKOV_TEST_KILL:-}" = 1 ] && [ $((RANDOM % 2)) = 0 ]; then
      how="kill -9 after ${RANDOM: -1}0 ms"; out="(killed)"
      # In a process group of its own (job control on), so the kill takes the cp or awk it is running too, as
      # closing the terminal would.
      set -m; "${cmd[@]}" >/dev/null 2>&1 & pid=$!; set +m
      sleep "0.$(printf '%02d' $((RANDOM % 60)))"; kill -9 -- "-$pid" 2>/dev/null; wait "$pid" 2>/dev/null; code=0
    elif [ -n "$stop" ]; then
      pt="$(pick "${points[@]}")"; how="stopped after $pt"
      out="$(MAKKOV_HARNESS_TEST=1 MAKKOV_HARNESS_TEST_STOP="$pt" "${cmd[@]}" 2>&1)"; code=0
    else
      out="$("${cmd[@]}" 2>&1)"; code=$?
    fi
    set -e
    said="$said--- $op $a ($im): ${cmd[*]}
${out:-}
"
    log="$log  $op $a ($im) ${p:+in the project }${sc:+--scope $sc }($how)
"
    [ "$code" = 0 ] || fail "step $step: $op $a failed: $out"
  done
  # Uninstall everything still installed (twice over, in case a manifest hands work on to another).
  for pass in 1 2; do
    for m in "$base"/.makkov-harness/install-*.txt; do
      [ -f "$m" ] || continue
      a="$(basename "$m" .txt)"; a="${a#install-}"
      im="$(pick "${impls[@]}")"; run_cmd "$im" uninstall "$a" "$p" ""
      out="$("${cmd[@]}" 2>&1)" || fail "final uninstall of $a ($im) failed: $out"
      said="$said--- uninstall $a ($im, final): ${cmd[*]}
$out
"
      log="$log  uninstall $a ($im, final)
"
    done
  done
  now="$(tree "$base")"
  [ "$now" = "$start" ] || fail "the folder is not as it was:
$(diff <(printf '%s\n' "$start") <(printf '%s\n' "$now") || true)"
  now_out="$(cd "$parent" && ls -la | grep -v -e ' \.$' -e ' \.\.$' -e " ${name%% *}" | awk '{print $1, $5, $NF}'; cksum "$parent/My" "$parent/${name%% *}x")"
  [ "$now_out" = "$outside" ] || fail "something outside the folder changed:
$(diff <(printf '%s\n' "$outside") <(printf '%s\n' "$now_out") || true)"
  rm -rf "$parent"
done
echo "installer sequences: $runs_total passed (seed $seed, $impl: ${impls[*]})"
