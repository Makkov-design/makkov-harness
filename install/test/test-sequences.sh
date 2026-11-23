#!/usr/bin/env bash
# Randomized sequences of install, update and uninstall, for several agents at once, with interruptions.
# After everything is uninstalled, the folder must be exactly as it was at the start (every file, byte for byte,
# and no folder added or removed), and nothing outside it may have changed. Seeded, so a failure can be re-run.
#
# Usage: bash install/test/test-sequences.sh [sequences] [seed]
#   MAKKOV_TEST_KILL=1   also kill runs with kill -9 at a random moment (timing-dependent; for local runs)
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
inst="$repo/install/install.sh"; uninst="$repo/install/uninstall.sh"
runs_total="${1:-20}" seed="${2:-1}"
RANDOM="$seed"
pick() { local a=("$@"); printf '%s' "${a[$((RANDOM % ${#a[@]}))]}"; }
# Everything under a folder, with checksums of files and targets of links.
tree() { (cd "$1" && find . -mindepth 1 -exec sh -c 'for f; do if [ -L "$f" ]; then echo "$f -> $(readlink "$f")"; elif [ -f "$f" ]; then echo "$f $(cksum < "$f")"; else echo "$f/"; fi; done' _ {} + | LC_ALL=C sort); }
fail() { echo "FAIL (sequence $n, seed $seed): $*"; echo "steps:"; printf '%s' "$log"; exit 1; }

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
  log=""
  for step in 1 2 3 4 5 6 7 8; do
    a="$(pick "${agents[@]}")"
    pa=(); [ -n "$p" ] && pa=("$p")
    case "$a" in cursor|copilot|windsurf|aider) [ -n "$p" ] || continue ;; esac
    op="$(pick install install update uninstall uninstall)"
    stop=""; [ $((RANDOM % 4)) = 0 ] && stop=yes
    if [ "$op" = uninstall ]; then cmd=(bash "$uninst" "$a" "${pa[@]}"); points=(u-skills u-rules)
      [ -f "$base/.makkov-harness/install-$a.txt" ] || continue
    else cmd=(bash "$inst" "$a" "${pa[@]}"); points=(skill skills rules)
      [ "$op" = update ] && [ $((RANDOM % 2)) = 0 ] && cmd+=(--scope design)
    fi
    how="normal"
    set +e
    if [ -n "$stop" ] && [ "${MAKKOV_TEST_KILL:-}" = 1 ] && [ $((RANDOM % 2)) = 0 ]; then
      how="kill -9 after ${RANDOM: -1}0 ms"
      # In a process group of its own (job control on), so the kill takes the cp or awk it is running too, as
      # closing the terminal would.
      set -m; "${cmd[@]}" >/dev/null 2>&1 & pid=$!; set +m
      sleep "0.$(printf '%02d' $((RANDOM % 60)))"; kill -9 -- "-$pid" 2>/dev/null; wait "$pid" 2>/dev/null; code=0
    elif [ -n "$stop" ]; then
      pt="$(pick "${points[@]}")"; how="stopped after $pt"
      MAKKOV_HARNESS_TEST=1 MAKKOV_HARNESS_TEST_STOP="$pt" "${cmd[@]}" >/dev/null 2>&1; code=0
    else
      out="$("${cmd[@]}" 2>&1)"; code=$?
    fi
    set -e
    log="$log  $op $a ${cmd[*]:3} ($how)
"
    [ "$code" = 0 ] || fail "step $step: $op $a failed: $out"
  done
  # Uninstall everything still installed (twice over, in case a manifest hands work on to another).
  for pass in 1 2; do
    for m in "$base"/.makkov-harness/install-*.txt; do
      [ -f "$m" ] || continue
      a="$(basename "$m" .txt)"; a="${a#install-}"
      pa=(); [ -n "$p" ] && pa=("$p")
      out="$(bash "$uninst" "$a" "${pa[@]}" 2>&1)" || fail "final uninstall of $a failed: $out"
      log="$log  uninstall $a (final)
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
echo "installer sequences: $runs_total passed (seed $seed)"
