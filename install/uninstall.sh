#!/usr/bin/env bash
# Removes what install.sh put in place for one agent, using the manifest it wrote
# (.makkov-harness/install-<agent>.txt in your home or project folder).
# - Skill folders: removed only if they are still identical to a copy the harness put there; a folder you
#   changed is moved to .makkov-harness/backups/<date>/removed/ instead. Folders another installed agent
#   still uses from the same place are left alone.
# - Skills of yours that the install moved aside are put back.
# - The routing block, and the personal layer harness-onboarding wrote, are taken out of the instructions
#   file, unless another installed agent still reads that file. A file you had before the install is put back
#   byte for byte when you have not changed it since; otherwise the copy of it as it was stays in
#   .makkov-harness/backups/original/. A Cursor rule (and its personal rule) is deleted and your earlier rule,
#   if there was one, is restored. A file the install created and that is now empty is deleted, and so are the
#   folders the install created, once empty. A symlink is never deleted.
# - The manifest names absolute paths; if the home or project folder was moved or renamed since the install,
#   they are read relative to the folder you pass now. A manifest that names paths the installer would not
#   use is refused, and nothing is changed.
#
# Usage: uninstall.sh codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run] [--follow-links]
#   --follow-links   in a project, follow a link of yours that leads outside it (see install.sh)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$here/lib.sh"

dry=0 follow=0
args=()
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --follow-links) follow=1 ;;
    *) args+=("$a") ;;
  esac
done
agent="${args[0]:-}"
project="${args[1]:-}"
repo="$(cd "$here/.." && pwd)"
case "$agent" in
  codex|cursor|gemini|copilot|windsurf|cline|opencode|aider) ;;
  *) echo "Usage: $0 codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run] [--follow-links]" >&2; exit 2 ;;
esac
if [ -n "$project" ]; then project="$(cd "$project" && pwd)"; fi
if [ -n "$project" ] && { [ "$project" = "$(cd "$HOME" && pwd)" ] || [ "$(cd "$project" && pwd -P)" = "$(cd "$HOME" && pwd -P)" ]; }; then
  echo "The project path is your home folder. For a user-level install, leave the project path out." >&2; exit 2
fi
base="${project:-$HOME}"
mh_drive_form "$base"
state="$base/.makkov-harness"
manifest="$state/install-$agent.txt"
stamp="$(date +%Y%m%d-%H%M%S)"
mh_paths "$agent" "$project"
skills_dir="$MH_SKILLS" rules="$MH_RULES"
# Everything under .makkov-harness/ may have come with the repository (install/lib.sh): no link on the way to
# anything this run changes there.
why="$(mh_check_inside "$base" "$state" "$manifest" "$manifest.new" "$state/backups/$stamp-$agent/removed")" ||
  { echo "$why." >&2; echo "Nothing was changed." >&2; exit 1; }
if [ ! -f "$manifest" ]; then
  [ "$dry" = 1 ] || mh_clear_lock_only "$state" "$base"
  echo "No makkov-harness install for $agent found in $base (no $manifest)." >&2
  echo "If you installed before 0.3.3, remove the skill folders and the marked block by hand; see INSTALL.md." >&2
  exit 1
fi
stop() { echo "$*" >&2; echo "Nothing was changed." >&2; exit 1; }
# Test hook, inert in normal use (see install.sh): u-skills = after the skills, u-rules = after the file.
checkpoint() { if [ "${MAKKOV_HARNESS_TEST:-}" = 1 ] && [ "${MAKKOV_HARNESS_TEST_STOP:-}" = "$1" ]; then echo "(test) stopped after $1" >&2; exit 1; fi; }

# One run at a time in this folder (a dry run changes nothing, so it takes no lock).
if [ "$dry" = 0 ]; then mh_lock "$state" "$base" || exit 1; trap mh_unlock EXIT; fi

# 0. Before anything is changed: every manifest here must be one the installer wrote for this folder, and the
#    files to change must be changeable.
for m in "$state"/install-*.txt; do
  [ -f "$m" ] || continue
  why="$(mh_valid_manifest "$m" "$base" "$project")" || stop "$m does not look like a manifest this installer wrote: $why. Move it out of $state and run this again."
done
ob="$(mh_old_base "$manifest")"
rules_existed="$(mh_raw "$manifest" rules_existed)"; rules_backup="$(mh_get "$manifest" rules_backup "$base")"
[ -n "$ob" ] && [ "$ob" != "$base" ] && echo "Installed in $ob, which is now $base: reading the install from here."
say() { echo "  $*"; }
do_() { if [ "$dry" = 1 ]; then return 0; fi; "$@"; }

# Other installs in the same folder that read the same skills folder or the same instructions file.
others() { for m in "$state"/install-*.txt; do [ "$m" = "$manifest" ] || [ ! -f "$m" ] || echo "$m"; done; }
same_skills() { [ "$(mh_get "$1" skills_dir "$base")" = "$skills_dir" ]; }
rules_users=""
while IFS= read -r m; do
  [ -n "$m" ] && [ "$(mh_get "$m" rules "$base")" = "$rules" ] && rules_users="$rules_users $(mh_raw "$m" agent)"
done < <(others)
edit_rules=0
if [ -z "$rules_users" ] && [ -f "$rules" ]; then
  if [ "$agent" = cursor ] || grep -qE '<!-- makkov-harness:(personal:)?start -->' "$rules"; then edit_rules=1; fi
fi
if [ "$edit_rules" = 1 ]; then
  why="$(mh_writable_file "$rules")" || stop "$why."
  why="$(mh_writable_dir "$(dirname "$rules")")" || stop "$why."
  if [ "$agent" != cursor ]; then
    mh_check_markers "$rules" || exit 1
    if mh_wide_text "$rules"; then stop "$rules is saved as UTF-16 or UTF-32. Save it as UTF-8, then run this again."; fi
  fi
fi
if [ -n "$skills_dir" ] && [ -d "$skills_dir" ]; then why="$(mh_writable_dir "$skills_dir")" || stop "$why."; fi
why="$(mh_writable_dir "$state")" || stop "$why."
# In a project, no link that leads outside it (unless --follow-links).
why="$(mh_check_links "$project" "$follow" "$skills_dir" "$rules")" || stop "$why."
[ "$dry" = 1 ] && echo "Dry run: nothing will be changed."

# 1. Skills. A folder is ours when it matches a fingerprint the harness recorded for it here (in this manifest
# or another agent's) or this repository's copy; one that changed since is moved aside.
if [ -n "$skills_dir" ]; then
  # Read the manifest line by line: home and project paths may contain spaces.
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    dst="$skills_dir/$name"
    [ -e "$dst" ] || continue
    # Only a skill folder (a SKILL.md in it) is taken for one the harness put there.
    if ! mh_skill_folder "$name" "$dst"; then say "leave $dst (no SKILL.md in it, so not a skill folder the harness put there)"; continue; fi
    # The other installs that list this skill, one path per line (paths may hold spaces or [ ]).
    shared=""
    while IFS= read -r m; do
      [ -n "$m" ] && same_skills "$m" && mh_cat "$m" | grep -Eq "^skill=$name( |$)" && shared="$shared$m
"
    done < <(others)
    if [ -n "$shared" ]; then
      say "keep $dst (another installed agent uses it)"
      # Hand on the fingerprints recorded here, so the last uninstall still knows this copy is the harness's.
      while IFS= read -r m; do
        [ -n "$m" ] || continue
        while IFS= read -r line; do
          [ -n "$line" ] || continue
          mh_cat "$m" | grep -qxF "$line" || { [ "$dry" = 1 ] || printf '%s\n' "$line" >> "$m"; }
        done < <(mh_cat "$manifest" | grep -E "^skill=$name [0-9a-f]+$" || true)
      done < <(printf '%s' "$shared")
      continue
    fi
    fp_now="$(mh_fingerprint "$dst")" ours=0
    # (A folder with no regular file in it has the fingerprint of any empty folder: never taken for ours.)
    [ "$fp_now" != "$MH_EMPTY_FP" ] && { mh_cat "$manifest" | grep -qxF "skill=$name $fp_now" ||
      { [ -d "$repo/skills/$name" ] && [ "$(mh_fingerprint "$repo/skills/$name")" = "$fp_now" ]; }; } && ours=1
    if [ "$ours" = 0 ] && [ "$fp_now" != "$MH_EMPTY_FP" ]; then
      while IFS= read -r m; do [ -n "$m" ] && same_skills "$m" && mh_cat "$m" | grep -qxF "skill=$name $fp_now" && ours=1; done < <(others)
    fi
    if [ "$ours" = 1 ]; then
      say "remove $dst"; do_ mh_drop "$dst"
    else
      say "move $dst to $state/backups/$stamp-$agent/removed/$name (you changed it)"
      do_ mkdir -p "$state/backups/$stamp-$agent/removed"; do_ mv "$dst" "$state/backups/$stamp-$agent/removed/$name"
    fi
  done < <(mh_cat "$manifest" | sed -n 's/^skill=//p' | cut -d' ' -f1 | awk '!seen[$0]++')
  # 2. Put back the skills the install moved aside. While another agent still uses this skills folder,
  #    hand the record of those backups on to its manifest, so its uninstall restores them.
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    same_skills "$m" || continue
    while IFS= read -r b; do
      [ -n "$b" ] || continue
      line="backup=$(mh_rebase "$b" "$ob" "$base")"
      mh_cat "$m" | grep -qxF "$line" || { say "hand the backup record on to $(basename "$m")"; [ "$dry" = 1 ] || printf '%s\n' "$line" >> "$m"; }
    done < <(mh_cat "$manifest" | sed -n 's/^backup=//p')
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
  done < <(mh_cat "$manifest" | sed -n 's/^backup=//p')
  # Copies an interrupted install left half made under a temporary name are the harness's own.
  if [ -d "$skills_dir" ]; then
    for t in "$skills_dir"/.mh-tmp-*; do [ -e "$t" ] && { say "remove $t (left by an interrupted install)"; do_ rm -rf "${t:?}"; }; done
  fi
  # The skills are done: a run after an interruption from here on does not take them up again.
  if [ "$dry" = 0 ]; then mh_cat "$manifest" | grep -v -e '^skill=' -e '^backup=' > "$manifest.new" || true; mv "$manifest.new" "$manifest"; fi
fi
checkpoint u-skills

# 3. Routing, and the personal layer harness-onboarding wrote next to it.
kept="$state/backups/$stamp-$agent/removed"
personal_rule="$(dirname "$rules")/makkov-harness-personal.mdc"
if [ "$agent" = "cursor" ] && [ -f "$personal_rule" ]; then
  say "delete $personal_rule (a copy stays in $kept/)"
  do_ mkdir -p "$kept"; do_ mv "$personal_rule" "$kept/makkov-harness-personal.mdc"
fi
# The copy of the file from before the first install, if this uninstall is the one to use it (a copy an
# install from 0.5.0 or earlier left next to the file, *.bak-<date>, is used but left where it is).
ours_backup=0
case "$rules_backup" in "$state/backups/original/"*) ours_backup=1 ;; esac
have_backup=0; [ -n "$rules_backup" ] && [ -f "$rules_backup" ] && have_backup=1
if [ -n "$rules_users" ]; then
  say "keep the routing block in $rules (also installed there for:$rules_users)"
elif [ -L "$rules" ] && [ ! -e "$rules" ]; then
  say "leave $rules alone (a symlink to a file that does not exist)"
elif [ "$edit_rules" = 1 ] && [ "$agent" = "cursor" ]; then
  if [ "$have_backup" = 1 ]; then say "restore your earlier rule from $rules_backup"; do_ mh_write_through "$rules" < "$rules_backup"
  elif [ -L "$rules" ]; then say "empty $rules (a symlink, so it is left in place)"; do_ mh_write_through "$rules" < /dev/null
  else say "delete $rules"; do_ rm -f "$rules"; fi
elif [ "$edit_rules" = 1 ]; then
  say "take the routing block and the personal layer out of $rules"
  if [ "$dry" = 0 ]; then
    if [ -n "$(mh_personal_layer "$rules")" ]; then
      mkdir -p "$kept"; (set -C; mh_personal_layer "$rules" > "$kept/personal-layer.md")
      say "your personal layer is kept in $kept/personal-layer.md"
    fi
    new="$(mktemp)"; mh_remove_blocks "$rules" > "$new"
    # Unchanged since the install apart from the harness's blocks: put back byte for byte.
    if [ "$have_backup" = 1 ] && mh_same_text "$new" "$rules_backup"; then cat "$rules_backup" > "$new"; fi
    if [ "$rules_existed" != 1 ] && ! grep -q '[^[:space:]]' "$new" && [ ! -L "$rules" ]; then
      rm -f "$rules"; say "delete $rules (the install created it and it is now empty)"
    else
      mh_write_through "$rules" < "$new"
    fi
    rm -f "$new"
  fi
fi
checkpoint u-rules
[ "$dry" = 1 ] || rm -f "$rules.mh-tmp"
# The copy of the file as it was goes once the file is back as it was; otherwise it stays, and you are told.
if [ -z "$rules_users" ] && [ "$ours_backup" = 1 ] && [ "$have_backup" = 1 ]; then
  if [ -f "$rules" ] && cmp -s "$rules" "$rules_backup"; then do_ rm -f "$rules_backup"
  elif [ "$dry" = 0 ]; then say "your $rules as it was before the first install is kept in $rules_backup (it differs from the file now)"; fi
fi

# 4. The manifest, then the folders the install created, once empty (deepest first). A folder still in use is
# handed on to another install in the same place, so the last uninstall takes it away.
created_dirs="$(mh_cat "$manifest" | sed -n 's/^created_dir=//p' | awk '{ print length($0) "\t" $0 }' | sort -rn | cut -f2-)"
do_ rm -f "$manifest"
left=""
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  d="$base/$rel"
  if [ -d "$d" ] && [ ! -L "$d" ] && [ -z "$(ls -A "$d")" ]; then say "remove the empty folder $d"; do_ rmdir "$d"
  elif [ -d "$d" ]; then left="${left}created_dir=$rel
"; fi
done < <(printf '%s\n' "$created_dirs")
if [ -n "$left" ]; then
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    while IFS= read -r line; do
      [ -n "$line" ] && ! mh_cat "$m" | grep -qxF "$line" && { [ "$dry" = 1 ] || printf '%s\n' "$line" >> "$m"; }
    done < <(printf '%s' "$left")
  done < <(others)
fi
if [ "$dry" = 0 ] && [ -d "$state" ]; then
  rm -f "$state"/install-*.txt.new
  find "$state" -type f -name '*.mh-tmp' -exec rm -f {} + 2>/dev/null || true
  # A copy an interrupted move left (the Node installer's .mh-tmp-move-<name>, across file systems).
  find "$state" -depth -mindepth 2 -type d -name '.mh-tmp-*' -exec rm -rf {} + 2>/dev/null || true
  find "$state" -depth -mindepth 1 -type d -empty -exec rmdir {} \; 2>/dev/null || true
  rmdir "$state" 2>/dev/null || true
  # The lock is still in it: the release takes the folder away once the lock is gone, if nothing else is left.
  MH_LOCK_STATE="$state"
fi
if [ "$dry" = 1 ]; then echo "Dry run done for $agent. Run again without --dry-run to uninstall."
else echo "makkov-harness removed for $agent. Restart the agent."; fi
