#!/usr/bin/env bash
# makkov-harness installer for agents other than Claude (macOS / Linux).
# Copies skills/ into the folder the agent reads and puts ROUTING.md into the agent's instructions
# file inside a marked block. Copies local files only; downloads nothing.
#
# Usage: install.sh codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run] [--scope all|design]
#   --dry-run        print every change it would make and write nothing
#   --scope design   route design work only: research reports, third-party installs and general coding
#                    plugins are left out of the routing map (the skills are still copied)
set -euo pipefail

dry=0 scope=all
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1 ;;
    --scope) scope="${2:-}"; shift ;;
    --scope=*) scope="${1#--scope=}" ;;
    *) args+=("$1") ;;
  esac
  shift
done
agent="${args[0]:-}"
project="${args[1]:-}"
repo="$(cd "$(dirname "$0")/.." && pwd)"

case "$agent" in
  codex|cursor|gemini|copilot|windsurf|cline|opencode|aider) ;;
  *) echo "Usage: $0 codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run] [--scope all|design]" >&2; exit 2 ;;
esac
case "$scope" in all|design) ;; *) echo "--scope is all or design" >&2; exit 2 ;; esac
if [ -n "$project" ]; then project="$(cd "$project" && pwd)"; fi
case "$agent" in
  cursor|copilot|windsurf|aider)
    if [ -z "$project" ]; then echo "$agent has no user-level instructions file this installer can edit. Pass a project path." >&2; exit 2; fi ;;
esac
base="${project:-$HOME}"

case "$agent" in
  cline) skills_dir="$base/.cline/skills" ;;
  aider) skills_dir="" ;;
  *)     skills_dir="$base/.agents/skills" ;;
esac
case "$agent" in
  codex)    rules="${project:+$project/AGENTS.md}";  rules="${rules:-$HOME/.codex/AGENTS.md}" ;;
  gemini)   rules="${project:+$project/GEMINI.md}";  rules="${rules:-$HOME/.gemini/GEMINI.md}" ;;
  opencode) rules="${project:+$project/AGENTS.md}";  rules="${rules:-$HOME/.config/opencode/AGENTS.md}" ;;
  cline)    rules="${project:+$project/AGENTS.md}";  rules="${rules:-$HOME/.agents/AGENTS.md}" ;;
  cursor)   rules="$project/.cursor/rules/makkov-harness.mdc" ;;
  aider)    rules="$project/CONVENTIONS.md" ;;
  *)        rules="$project/AGENTS.md" ;;
esac

stamp="$(date +%Y%m%d-%H%M%S)"
backup_root="$base/.makkov-harness/backups/$stamp"
[ "$dry" = 1 ] && echo "Dry run: nothing will be written."

# A fingerprint of a folder: the checksum of every file's checksum, size and path.
fingerprint() { (cd "$1" && find . -type f -exec cksum {} + | LC_ALL=C sort) | cksum | cut -d' ' -f1; }
state="$base/.makkov-harness"
# What earlier installs into this skills folder put there, from every manifest that points at it.
earlier=""
if [ -n "$skills_dir" ] && [ -d "$state" ]; then
  for m in "$state"/install-*.txt; do
    [ -f "$m" ] || continue
    [ "$(sed -n 's/^skills_dir=//p' "$m" | head -n 1)" = "$skills_dir" ] && earlier="$earlier$(grep '^skill=' "$m")
"
  done
fi

# 1. Skills (rich-report needs Claude Artifacts, so it is skipped here).
# - an identical copy of ours, or the copy an earlier install of this harness put there, is replaced;
# - a folder an install from before 0.5.0 put there (no fingerprint recorded, so it may have been edited) is
#   moved to backups/<date>/earlier-harness/ and left there;
# - anything else (your own skill, or ours that you edited) is moved to backups/<date>/skills/ and put back
#   by the uninstaller. Nothing is deleted that might be yours.
copied="" backed="" older=""
manifest_skills=""
if [ -n "$skills_dir" ]; then
  [ "$dry" = 1 ] || mkdir -p "$skills_dir"
  for d in "$repo"/skills/*/; do
    name="$(basename "$d")"
    [ "$name" = "rich-report" ] && continue
    fp_new="$(fingerprint "${d%/}")"
    dst="$skills_dir/$name"
    if [ -e "$dst" ]; then
      fp_old="$(fingerprint "$dst")"
      if [ "$fp_old" = "$fp_new" ] || printf '%s' "$earlier" | grep -qx "skill=$name $fp_old"; then
        [ "$dry" = 1 ] && echo "  would update $dst (a copy this harness put there)" || rm -rf "${dst:?}"
      elif printf '%s' "$earlier" | grep -qx "skill=$name"; then
        if [ "$dry" = 1 ]; then echo "  would move $dst (from an install before 0.5.0) to $backup_root/earlier-harness/$name"
        else mkdir -p "$backup_root/earlier-harness"; mv "$dst" "$backup_root/earlier-harness/$name"; fi
        older="$older $name"
      else
        if [ "$dry" = 1 ]; then echo "  would move your $dst to $backup_root/skills/$name, then copy ours"
        else mkdir -p "$backup_root/skills"; mv "$dst" "$backup_root/skills/$name"; fi
        backed="$backed $name"
      fi
    else
      [ "$dry" = 1 ] && echo "  would copy $name to $dst"
    fi
    [ "$dry" = 1 ] || cp -R "${d%/}" "$dst"
    copied="$copied $name"
    manifest_skills="${manifest_skills}skill=$name $fp_new
"
  done
fi

# 2. Routing block.
routing="$(sed 's/`rich-report` (Claude with Artifacts) or `html-report` (any agent)/`html-report`/' "$repo/ROUTING.md")"
if [ "$scope" = design ]; then
  # Design work only: drop the rows that route research, installs and general coding.
  routing="$(printf '%s\n' "$routing" | grep -v -e '^| Research, analysis' -e '^| Installing, adding' -e '^| Any new feature or creative work' -e '^| Whole-project security review')"
  routing="$routing

Scope: design work only (installed with --scope design). For research, installs and general coding, work as you would without this harness."
fi
block="<!-- makkov-harness:start -->
$routing
<!-- makkov-harness:end -->"
if [ "$dry" = 1 ]; then
  if [ -f "$rules" ]; then
    echo "  would back up $rules to $rules.bak-$stamp"
    if [ "$agent" = "cursor" ]; then echo "  would rewrite $rules with the routing rule"
    elif grep -q '<!-- makkov-harness:start -->' "$rules"; then echo "  would update the marked routing block in $rules"
    else echo "  would append the marked routing block to $rules"; fi
  else
    echo "  would create $rules with the routing block"
  fi
  echo "Dry run done for $agent. Run again without --dry-run to install."
  exit 0
fi
mkdir -p "$(dirname "$rules")"
# Every instructions file it is about to change, the Cursor rule included, gets a dated copy first.
# The uninstaller needs to know whether the file was yours before the first install.
state="$base/.makkov-harness"
manifest="$state/install-$agent.txt"
rules_existed=0 rules_backup=""
if [ -f "$manifest" ]; then
  rules_existed="$(sed -n 's/^rules_existed=//p' "$manifest")"; rules_backup="$(sed -n 's/^rules_backup=//p' "$manifest")"
elif [ -f "$rules" ] && ! grep -q '<!-- makkov-harness:start -->' "$rules"; then
  rules_existed=1; rules_backup="$rules.bak-$stamp"
fi
if [ -f "$rules" ]; then cp "$rules" "$rules.bak-$stamp"; fi
if [ "$agent" = "cursor" ]; then
  printf -- '---\ndescription: makkov-harness routing - which skill fits which situation\nalwaysApply: true\n---\n%s\n' "$block" > "$rules"
elif [ -f "$rules" ]; then
  if grep -q '<!-- makkov-harness:start -->' "$rules"; then
    tmp="$(mktemp)"
    BLK="$block" awk '
      /<!-- makkov-harness:start -->/ { print ENVIRON["BLK"]; skip=1; next }
      /<!-- makkov-harness:end -->/   { skip=0; next }
      !skip { print }' "$rules" > "$tmp"
    mv "$tmp" "$rules"
  else
    printf '\n%s\n' "$block" >> "$rules"
  fi
else
  printf '%s\n' "$block" > "$rules"
fi

# 3. Manifest: what this install put where, so install/uninstall.sh removes exactly that.
mkdir -p "$state"
old_backups=""; [ -f "$manifest" ] && old_backups="$(grep '^backup=' "$manifest" || true)"
{
  echo "agent=$agent"
  echo "installed=$stamp"
  echo "skills_dir=$skills_dir"
  echo "rules=$rules"
  echo "rules_existed=${rules_existed:-0}"
  echo "rules_backup=$rules_backup"
  echo "scope=$scope"
  [ -n "$old_backups" ] && echo "$old_backups"
  [ -n "$backed" ] && echo "backup=$backup_root/skills"
  printf '%s' "$manifest_skills"
} > "$manifest"

echo "makkov-harness installed for $agent"
[ -n "$skills_dir" ] && echo "Skills -> $skills_dir :$copied"
[ -n "$backed" ] && echo "Kept your earlier versions of:$backed -> $backup_root/skills"
[ -n "$older" ] && echo "Moved the copies an install before 0.5.0 left of:$older -> $backup_root/earlier-harness (delete them if you never edited them)"
echo "Routing -> $rules"
[ "$agent" = "aider" ] && echo "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project."
echo "Restart the agent, then run the harness-onboarding skill to personalize it."
