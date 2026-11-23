#!/usr/bin/env bash
# Removes what install.sh put in place for one agent, using the manifest it wrote
# (.makkov-harness/install-<agent>.txt in your home or project folder).
# - Skill folders: removed only if they are still identical to the copy the install put there; a folder you
#   changed is moved to .makkov-harness/backups/<date>/removed/ instead. Folders another installed agent
#   still uses from the same place are left alone.
# - Skills of yours that the install moved aside are put back.
# - The routing block, and the personal layer harness-onboarding wrote, are taken out of the instructions
#   file, unless another installed agent still reads that file; a file you had before the install is put back
#   byte for byte when you have not changed it since. A Cursor rule (and its personal rule) is deleted and
#   your earlier rule, if there was one, is restored. A file the install created and that is now empty is
#   deleted, and so are the folders the install created, once empty.
# - The manifest names absolute paths; if the home or project folder was moved or renamed since the install,
#   they are read relative to the folder you pass now.
#
# Usage: uninstall.sh codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$here/lib.sh"

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
repo="$(cd "$here/.." && pwd)"
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

ob="$(mh_old_base "$manifest")"
skills_dir="$(mh_get "$manifest" skills_dir "$base")"; rules="$(mh_get "$manifest" rules "$base")"
rules_existed="$(mh_raw "$manifest" rules_existed)"; rules_backup="$(mh_get "$manifest" rules_backup "$base")"
[ -n "$ob" ] && [ "$ob" != "$base" ] && echo "Installed in $ob, which is now $base: reading the install from here."
stamp="$(date +%Y%m%d-%H%M%S)"
say() { echo "  $*"; }
do_() { if [ "$dry" = 1 ]; then return 0; fi; "$@"; }
[ "$dry" = 1 ] && echo "Dry run: nothing will be changed."

# Other installs in the same folder that read the same skills folder or the same instructions file.
others() { for m in "$state"/install-*.txt; do [ "$m" = "$manifest" ] || [ ! -f "$m" ] || echo "$m"; done; }
shared() {
  local m
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    [ "$(mh_get "$m" skills_dir "$base")" = "$skills_dir" ] && grep -q "^skill=$1\( \|$\)" "$m" && return 0
  done < <(others)
  return 1
}
rules_users=""
while IFS= read -r m; do
  [ -n "$m" ] && [ "$(mh_get "$m" rules "$base")" = "$rules" ] && rules_users="$rules_users $(mh_raw "$m" agent)"
done < <(others)
# The file is rewritten only when its markers can be trusted; otherwise nothing is changed.
[ "$agent" = cursor ] || [ -n "$rules_users" ] || mh_check_markers "$rules" || exit 1

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
    if { [ -n "$fp" ] && [ "$(mh_fingerprint "$dst")" = "$fp" ]; } ||
       { [ -z "$fp" ] && [ -d "$repo/skills/$name" ] && diff -rq "$repo/skills/$name" "$dst" >/dev/null 2>&1; }; then
      say "remove $dst"; do_ rm -rf "${dst:?}"
    else
      say "move $dst to $state/backups/$stamp/removed/$name (you changed it)"
      do_ mkdir -p "$state/backups/$stamp/removed"; do_ mv "$dst" "$state/backups/$stamp/removed/$name"
    fi
  done < <(sed -n 's/^skill=//p' "$manifest")
  # 2. Put back the skills the install moved aside. While another agent still uses this skills folder,
  #    hand the record of those backups on to its manifest, so its uninstall restores them.
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    [ "$(mh_get "$m" skills_dir "$base")" = "$skills_dir" ] || continue
    while IFS= read -r b; do
      [ -n "$b" ] || continue
      line="backup=$(mh_rebase "$b" "$ob" "$base")"
      grep -qxF "$line" "$m" || { say "hand the backup record on to $(basename "$m")"; [ "$dry" = 1 ] || printf '%s\n' "$line" >> "$m"; }
    done < <(sed -n 's/^backup=//p' "$manifest")
  done < <(others)
  while IFS= read -r b; do
    b="$(mh_rebase "$b" "$ob" "$base")"
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
kept="$state/backups/$stamp/removed"
personal_rule="$(dirname "$rules")/makkov-harness-personal.mdc"
if [ "$agent" = "cursor" ] && [ -f "$personal_rule" ]; then
  say "delete $personal_rule (a copy stays in $kept/)"
  do_ mkdir -p "$kept"; do_ mv "$personal_rule" "$kept/makkov-harness-personal.mdc"
fi
# The copy of the file from before the first install, if this uninstall is the one to use it (a copy an
# install from 0.5.0 or earlier left next to the file, *.bak-<date>, is used but left where it is).
ours_backup=0
case "$rules_backup" in "$state/backups/original/"*) ours_backup=1 ;; esac
if [ -n "$rules_users" ]; then
  say "keep the routing block in $rules (also installed there for:$rules_users)"
elif [ -f "$rules" ]; then
  if [ "$agent" = "cursor" ]; then
    say "delete $rules"; do_ rm -f "$rules"
    if [ -n "$rules_backup" ] && [ -f "$rules_backup" ]; then say "restore your earlier rule from $rules_backup"; do_ cp "$rules_backup" "$rules"; fi
  elif grep -qE '<!-- makkov-harness:(personal:)?start -->' "$rules"; then
    say "take the routing block and the personal layer out of $rules"
    if [ "$dry" = 0 ]; then
      if [ -n "$(mh_personal_layer "$rules")" ]; then
        mkdir -p "$kept"; mh_personal_layer "$rules" > "$kept/personal-layer.md"
        say "your personal layer is kept in $kept/personal-layer.md"
      fi
      new="$(mktemp)"; mh_remove_blocks "$rules" > "$new"
      # Unchanged since the install apart from the harness's blocks: put back byte for byte.
      if [ -n "$rules_backup" ] && [ -f "$rules_backup" ] && [ "$(cat "$new")" = "$(cat "$rules_backup")" ]; then cat "$rules_backup" > "$new"; fi
      if [ "$rules_existed" != 1 ] && ! grep -q '[^[:space:]]' "$new"; then
        rm -f "$rules"; say "delete $rules (the install created it and it is now empty)"
      else
        mh_write_through "$rules" < "$new"
      fi
      rm -f "$new"
    fi
  fi
fi
if [ -z "$rules_users" ] && [ "$ours_backup" = 1 ] && [ -f "$rules_backup" ]; then do_ rm -f "$rules_backup"; fi

# 4. The manifest, then the folders the install created, once empty (deepest first). A folder still in use is
# handed on to another install in the same place, so the last uninstall takes it away.
created_dirs="$(sed -n 's/^created_dir=//p' "$manifest" | awk '{ print length($0) "\t" $0 }' | sort -rn | cut -f2-)"
do_ rm -f "$manifest"
left=""
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  d="$base/$rel"
  if [ -d "$d" ] && [ -z "$(ls -A "$d")" ]; then say "remove the empty folder $d"; do_ rmdir "$d"
  elif [ -d "$d" ]; then left="${left}created_dir=$rel
"; fi
done < <(printf '%s\n' "$created_dirs")
if [ -n "$left" ]; then
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    while IFS= read -r line; do
      [ -n "$line" ] && ! grep -qxF "$line" "$m" && { [ "$dry" = 1 ] || printf '%s\n' "$line" >> "$m"; }
    done < <(printf '%s' "$left")
  done < <(others)
fi
if [ "$dry" = 0 ] && [ -d "$state" ]; then
  find "$state" -depth -mindepth 1 -type d -empty -exec rmdir {} \; 2>/dev/null || true
  rmdir "$state" 2>/dev/null || true
fi
if [ "$dry" = 1 ]; then echo "Dry run done for $agent. Run again without --dry-run to uninstall."
else echo "makkov-harness removed for $agent. Restart the agent."; fi
