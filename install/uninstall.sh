#!/usr/bin/env bash
# Removes what install.sh put in place for one agent, using the manifest it wrote
# (.makkov-harness/install-<agent>.txt in your home or project folder).
# - Skill folders: removed only if they are still identical to the copy in this repository; a folder you
#   changed is moved to .makkov-harness/backups/<date>/removed/ instead. Folders another installed agent
#   still uses from the same place are left alone.
# - Skills of yours that the install moved aside are put back.
# - The routing block, and the personal layer harness-onboarding wrote, are taken out of the instructions
#   file; a Cursor rule (and its personal rule) is deleted and your earlier rule, if there was one, is
#   restored. A file the install created and that is now empty is deleted.
#
# Usage: uninstall.sh codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run]
set -euo pipefail

dry=0
args=()
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    *) args+=("$a") ;;
  esac
done
agent="${args[0]:-}"
project="${args[1]:-}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
case "$agent" in
  codex|cursor|gemini|copilot|windsurf|cline|opencode|aider) ;;
  *) echo "Usage: $0 codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run]" >&2; exit 2 ;;
esac
if [ -n "$project" ]; then project="$(cd "$project" && pwd)"; fi
base="${project:-$HOME}"
state="$base/.makkov-harness"
manifest="$state/install-$agent.txt"
if [ ! -f "$manifest" ]; then
  echo "No makkov-harness install for $agent found in $base (no $manifest)." >&2
  echo "If you installed before 0.3.3, remove the skill folders and the marked block by hand; see INSTALL.md." >&2
  exit 1
fi

get() { sed -n "s/^$1=//p" "$manifest" | head -n 1; }
skills_dir="$(get skills_dir)"; rules="$(get rules)"
rules_existed="$(get rules_existed)"; rules_backup="$(get rules_backup)"
stamp="$(date +%Y%m%d-%H%M%S)"
say() { echo "  $*"; }
do_() { if [ "$dry" = 1 ]; then return 0; fi; "$@"; }
[ "$dry" = 1 ] && echo "Dry run: nothing will be changed."

# Skills still listed by another agent's install in the same place stay.
shared() {
  for m in "$state"/install-*.txt; do
    [ "$m" = "$manifest" ] && continue
    [ -f "$m" ] || continue
    [ "$(sed -n 's/^skills_dir=//p' "$m" | head -n 1)" = "$skills_dir" ] && grep -q "^skill=$1\( \|$\)" "$m" && return 0
  done
  return 1
}
fingerprint() { (cd "$1" && find . -type f -exec cksum {} + | LC_ALL=C sort) | cksum | cut -d' ' -f1; }

# 1. Skills. A folder still matching the fingerprint the install recorded is ours and is removed; one that
# changed since is moved aside. Installs from before 0.5.0 recorded no fingerprint: compare with this copy.
if [ -n "$skills_dir" ]; then
  # Read the manifest line by line: home and project paths may contain spaces.
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    name="${line%% *}"; fp=""; [ "$line" != "$name" ] && fp="${line#* }"
    dst="$skills_dir/$name"
    [ -e "$dst" ] || continue
    if shared "$name"; then say "keep $dst (another installed agent uses it)"; continue; fi
    if { [ -n "$fp" ] && [ "$(fingerprint "$dst")" = "$fp" ]; } ||
       { [ -z "$fp" ] && [ -d "$repo/skills/$name" ] && diff -rq "$repo/skills/$name" "$dst" >/dev/null 2>&1; }; then
      say "remove $dst"; do_ rm -rf "${dst:?}"
    else
      say "move $dst to $state/backups/$stamp/removed/$name (you changed it)"
      do_ mkdir -p "$state/backups/$stamp/removed"; do_ mv "$dst" "$state/backups/$stamp/removed/$name"
    fi
  done < <(sed -n 's/^skill=//p' "$manifest")
  # 2. Put back the skills the install moved aside. While another agent still uses this skills folder,
  #    hand the record of those backups on to its manifest, so its uninstall restores them.
  for m in "$state"/install-*.txt; do
    [ "$m" = "$manifest" ] || [ ! -f "$m" ] && continue
    [ "$(sed -n 's/^skills_dir=//p' "$m" | head -n 1)" = "$skills_dir" ] || continue
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      grep -qxF "$line" "$m" || { say "hand the backup record on to $(basename "$m")"; [ "$dry" = 1 ] || printf '%s
' "$line" >> "$m"; }
    done < <(grep '^backup=' "$manifest" || true)
  done
  while IFS= read -r b; do
    [ -n "$b" ] && [ -d "$b" ] || continue
    for d in "$b"/*/; do
      [ -d "$d" ] || continue
      name="$(basename "$d")"
      if [ -e "$skills_dir/$name" ]; then say "leave your earlier $name in $b ($skills_dir/$name exists)"
      else say "restore your $name to $skills_dir/$name"; do_ mv "${d%/}" "$skills_dir/$name"; fi
    done
  done < <(sed -n 's/^backup=//p' "$manifest")
fi

# 3. Routing, and the personal layer harness-onboarding wrote next to it.
personal_rule="$(dirname "$rules")/makkov-harness-personal.mdc"
if [ "$agent" = "cursor" ] && [ -f "$personal_rule" ]; then
  say "delete $personal_rule (a copy stays as $personal_rule.bak-$stamp)"
  do_ cp "$personal_rule" "$personal_rule.bak-$stamp"; do_ rm -f "$personal_rule"
fi
if [ -f "$rules" ]; then
  if [ "$agent" = "cursor" ]; then
    say "delete $rules"; do_ rm -f "$rules"
    if [ -n "$rules_backup" ] && [ -f "$rules_backup" ]; then say "restore your earlier rule from $rules_backup"; do_ cp "$rules_backup" "$rules"; fi
  elif grep -qE '<!-- makkov-harness:(personal:)?start -->' "$rules"; then
    say "take the routing block and the personal layer out of $rules"
    if [ "$dry" = 0 ]; then
      cp "$rules" "$rules.bak-$stamp"
      tmp="$(mktemp)"
      awk '/<!-- makkov-harness:(personal:)?start -->/ { skip=1; next } /<!-- makkov-harness:(personal:)?end -->/ { skip=0; next } !skip { print }' "$rules" > "$tmp"
      mv "$tmp" "$rules"
      if [ "$rules_existed" != 1 ] && ! grep -q '[^[:space:]]' "$rules"; then rm -f "$rules" "$rules.bak-$stamp"; say "delete $rules (the install created it and it is now empty)"; fi
    fi
  fi
fi

do_ rm -f "$manifest"
if [ "$dry" = 1 ]; then echo "Dry run done for $agent. Run again without --dry-run to uninstall."
else echo "makkov-harness removed for $agent. Restart the agent."; fi
