#!/usr/bin/env bash
# makkov-harness installer for agents other than Claude (macOS / Linux).
# Copies skills/ into the folder the agent reads and puts ROUTING.md into the agent's instructions
# file inside a marked block. Copies local files only; downloads nothing.
#
# Usage: install.sh codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path]
set -euo pipefail

agent="${1:-}"
project="${2:-}"
repo="$(cd "$(dirname "$0")/.." && pwd)"

case "$agent" in
  codex|cursor|gemini|copilot|windsurf|cline|opencode|aider) ;;
  *) echo "Usage: $0 codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path]" >&2; exit 2 ;;
esac
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

# 1. Skills (rich-report needs Claude Artifacts, so it is skipped here).
# A folder with the same name that is not an identical copy of ours (your own skill, or one you
# edited) is moved to the backup folder first, never deleted.
copied="" backed=""
if [ -n "$skills_dir" ]; then
  mkdir -p "$skills_dir"
  for d in "$repo"/skills/*/; do
    name="$(basename "$d")"
    [ "$name" = "rich-report" ] && continue
    if [ -e "$skills_dir/$name" ]; then
      if diff -rq "${d%/}" "$skills_dir/$name" >/dev/null 2>&1; then
        rm -rf "${skills_dir:?}/$name"
      else
        mkdir -p "$backup_root/skills"
        mv "$skills_dir/$name" "$backup_root/skills/$name"
        backed="$backed $name"
      fi
    fi
    cp -R "${d%/}" "$skills_dir/$name"
    copied="$copied $name"
  done
fi

# 2. Routing block.
routing="$(sed 's/`rich-report` (Claude with Artifacts) or `html-report` (any agent)/`html-report`/' "$repo/ROUTING.md")"
block="<!-- makkov-harness:start -->
$routing
<!-- makkov-harness:end -->"
mkdir -p "$(dirname "$rules")"
# Every instructions file it is about to change, the Cursor rule included, gets a dated copy first.
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

echo "makkov-harness installed for $agent"
[ -n "$skills_dir" ] && echo "Skills -> $skills_dir :$copied"
[ -n "$backed" ] && echo "Kept your earlier versions of:$backed -> $backup_root/skills"
echo "Routing -> $rules"
[ "$agent" = "aider" ] && echo "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project."
echo "Restart the agent, then run the harness-onboarding skill to personalize it."
