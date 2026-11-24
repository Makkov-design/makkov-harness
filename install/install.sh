#!/usr/bin/env bash
# makkov-harness installer for agents other than Claude (macOS / Linux).
# Copies skills/ into the folder the agent reads and puts ROUTING.md into the agent's instructions
# file inside a marked block. Copies local files only; downloads nothing. Running it again updates.
#
# Usage: install.sh codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run] [--scope all|design]
#   --dry-run        print every change it would make and write nothing
#   --scope design   route design work only: research reports, third-party installs and general coding
#                    plugins are left out of the routing map (the skills are still copied). An update keeps
#                    the scope of the earlier install unless you pass --scope again.
#
# The order is the safety: everything that can fail is checked before the first change; the manifest
# (.makkov-harness/install-<agent>.txt) records what the run is about to do before it does it, so an
# interrupted run can be run again or uninstalled; the instructions file is kept once, as it was, before the
# harness first changes it; and everything under .makkov-harness/ and in the skills folder is read as untrusted
# input, since it may have come with the repository (install/lib.sh, mh_check_inside and mh_valid_manifest).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$here/lib.sh"
usage="Usage: $0 codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [project-path] [--dry-run] [--scope all|design]"

dry=0 scope="" scope_given=0
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1 ;;
    --scope) [ $# -ge 2 ] || { echo "--scope needs a value: all or design" >&2; echo "$usage" >&2; exit 2; }
             scope="$2"; scope_given=1; shift ;;
    --scope=*) scope="${1#--scope=}"; scope_given=1 ;;
    *) args+=("$1") ;;
  esac
  shift
done
agent="${args[0]:-}"
project="${args[1]:-}"
repo="$(cd "$here/.." && pwd)"

case "$agent" in
  codex|cursor|gemini|copilot|windsurf|cline|opencode|aider) ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
if [ "$scope_given" = 1 ]; then case "$scope" in all|design) ;; *) echo "--scope is all or design" >&2; echo "$usage" >&2; exit 2 ;; esac; fi
if [ -n "$project" ]; then project="$(cd "$project" && pwd)"; fi
case "$agent" in
  cursor|copilot|windsurf|aider)
    if [ -z "$project" ]; then echo "$agent has no user-level instructions file this installer can edit. Pass a project path." >&2; exit 2; fi ;;
esac
if [ -n "$project" ] && { [ "$project" = "$(cd "$HOME" && pwd)" ] || [ "$(cd "$project" && pwd -P)" = "$(cd "$HOME" && pwd -P)" ]; }; then
  echo "The project path is your home folder, where a user-level install keeps its manifest. Leave the project path out for a user-level install, or pass a project folder." >&2
  exit 2
fi
base="${project:-$HOME}"
mh_drive_form "$base"
mh_paths "$agent" "$project"
skills_dir="$MH_SKILLS" rules="$MH_RULES"

stamp="$(date +%Y%m%d-%H%M%S)"
state="$base/.makkov-harness"
manifest="$state/install-$agent.txt"
# One folder per run and agent: two agents installed in the same second never share a backup folder (each
# uninstall puts back what its own folder holds, into its own skills folder).
backup_root="$state/backups/$stamp-$agent"
rel_rules="$(mh_rel "$rules" "$base")"
original="$state/backups/original/$rel_rules"
[ "$dry" = 1 ] && echo "Dry run: nothing will be written."
stop() { echo "$*" >&2; echo "Nothing was changed." >&2; exit 1; }
# Test hook, inert in normal use: with both MAKKOV_HARNESS_TEST=1 and MAKKOV_HARNESS_TEST_STOP=<point> set, the
# run stops at that point (skill = after the first skill is in place, skills, rules), as an interruption would.
# install/test/ uses it to check that an interrupted run can be run again or uninstalled.
checkpoint() { if [ "${MAKKOV_HARNESS_TEST:-}" = 1 ] && [ "${MAKKOV_HARNESS_TEST_STOP:-}" = "$1" ]; then echo "(test) stopped after $1" >&2; exit 1; fi; }

# No link on the way to anything this run writes under the harness folder or the skills folder.
why="$(mh_check_inside "$base" "$state" "$manifest" "$manifest.new" "$original" "$original.mh-tmp" "$backup_root/skills" "$backup_root/removed" "$backup_root/earlier-harness" "$skills_dir")" || stop "$why."

# One run at a time in this folder (a dry run writes nothing, so it takes no lock).
if [ "$dry" = 0 ]; then mh_lock "$state" "$base" || exit 1; trap mh_unlock EXIT; fi

# 0. Before anything is written.
# Every manifest in this folder must be one the installer wrote for this folder.
if [ -d "$state" ]; then
  for m in "$state"/install-*.txt; do
    [ -f "$m" ] || continue
    why="$(mh_valid_manifest "$m" "$base" "$project")" || stop "$m does not look like a manifest this installer wrote: $why. Move it out of $state and run this again."
  done
fi
# The earlier install of this agent, with its paths moved onto this folder if the folder was moved or renamed.
rules_existed=0 rules_backup="" old_backups="" old_created="" old_skills=""
if [ -f "$manifest" ]; then
  rules_existed="$(mh_raw "$manifest" rules_existed)"; rules_backup="$(mh_get "$manifest" rules_backup "$base")"
  ob="$(mh_old_base "$manifest")"
  while IFS= read -r b; do [ -n "$b" ] && old_backups="${old_backups}backup=$(mh_rebase "$b" "$ob" "$base")
"; done < <(mh_cat "$manifest" | sed -n 's/^backup=//p')
  old_created="$(mh_cat "$manifest" | grep '^created_dir=' || true)"
  old_skills="$(mh_cat "$manifest" | grep '^skill=' || true)"
  if [ "$scope_given" = 0 ]; then scope="$(mh_raw "$manifest" scope)"; [ "$scope" = design ] && echo "Scope: design (kept from the earlier install; pass --scope all to change it)"; fi
fi
case "$scope" in all|design) ;; *) scope=all ;; esac
# Another agent installed into the same instructions file (Codex, Copilot, Windsurf, Cline and OpenCode all use
# <project>/AGENTS.md): this install shares its record of the file as it was before the harness.
shared_rules=0
if [ ! -f "$manifest" ] && [ -d "$state" ]; then
  for m in "$state"/install-*.txt; do
    [ -f "$m" ] || continue
    if [ "$(mh_get "$m" rules "$base")" = "$rules" ]; then
      rules_existed="$(mh_raw "$m" rules_existed)"; rules_backup="$(mh_get "$m" rules_backup "$base")"; shared_rules=1; break
    fi
  done
fi
# A file that is there at the first install is kept, as it was, whatever it holds (a marked block too). A copy
# an interrupted earlier run left in backups/original/ is the file as it was, so it is used, never replaced.
# When another agent's install already names the file, its record stands: the harness made the file or kept it.
# A Cursor rule is put back from that copy as it is, so for Cursor a copy no install here recorded (it may have come
# with the repository) is used only when it is the rule as it is now.
need_copy=0
if [ ! -f "$manifest" ] && [ "$shared_rules" = 0 ] && [ -z "$rules_backup" ]; then
  if [ -f "$original" ] && [ "$agent" = cursor ] && ! { [ -f "$rules" ] && cmp -s "$rules" "$original"; }; then
    [ -f "$rules" ] && stop "$original is a copy of $rules that no install here recorded, and it differs from the file. Move it out of $state, then run this again."
  elif [ -f "$original" ]; then rules_existed=1; rules_backup="$original"
  elif [ -f "$rules" ]; then rules_existed=1; rules_backup="$original"; need_copy=1; fi
fi
[ "$rules_backup" = "$original" ] && [ ! -f "$original" ] && [ -f "$rules" ] && need_copy=1
# Files and folders it is about to change: they must be there to change, or creatable.
why="$(mh_writable_file "$rules")" || stop "$why."
# The file is replaced through a temporary file next to it, so its folder must be writable too.
if [ -f "$rules" ] && [ ! -L "$rules" ]; then why="$(mh_writable_dir "$(dirname "$rules")")" || stop "$why."; fi
if [ "$agent" != cursor ]; then
  mh_check_markers "$rules" || exit 1
  if mh_wide_text "$rules"; then stop "$rules is saved as UTF-16 or UTF-32. Save it as UTF-8, then run this again."; fi
fi
if [ -n "$skills_dir" ]; then why="$(mh_writable_dir "$skills_dir")" || stop "$why."; fi
why="$(mh_writable_dir "$state")" || stop "$why."

# What earlier installs into this skills folder put there, from every manifest that points at it.
earlier=""
if [ -n "$skills_dir" ] && [ -d "$state" ]; then
  for m in "$state"/install-*.txt; do
    [ -f "$m" ] || continue
    if [ "$(mh_get "$m" skills_dir "$base")" = "$skills_dir" ]; then earlier="$earlier$(mh_cat "$m" | grep '^skill=' || true)
"; fi
  done
fi
# This version's skills (rich-report needs Claude Artifacts, so it is skipped here) and their fingerprints.
names="" manifest_skills=""
if [ -n "$skills_dir" ]; then
  for d in "$repo"/skills/*/; do
    name="$(basename "$d")"
    [ "$name" = "rich-report" ] && continue
    names="$names$name
"
    manifest_skills="${manifest_skills}skill=$name $(mh_fingerprint "${d%/}")
"
    # A file (not a folder) where a skill folder goes: stop now rather than half way.
    if { [ -e "$skills_dir/$name" ] || [ -L "$skills_dir/$name" ]; } && [ ! -d "$skills_dir/$name" ]; then
      stop "$skills_dir/$name is a file, where the $name skill folder goes. Move it away, then run this again."
    fi
  done
fi
fp_of() { printf '%s' "$manifest_skills" | sed -n "s/^skill=$1 //p"; }

# Folders this install creates, so the uninstaller can take them away again once they are empty.
created="$old_created"
add_created() { local d; while IFS= read -r d; do [ -n "$d" ] && ! printf '%s\n' "$created" | grep -qxF "created_dir=$d" && created="${created}created_dir=$d
"; done < <(mh_missing_dirs "$1" "$base"); return 0; }
[ -n "$skills_dir" ] && add_created "$skills_dir"
add_created "$(dirname "$rules")"

# The manifest: what this install puts where, so install/uninstall.sh removes exactly that. Paths are
# absolute; base= says which folder they were written for, so a moved folder can still be read.
write_manifest() {   # $1: skill lines, $2: backup lines
  mkdir -p "$state"
  {
    echo "agent=$agent"
    echo "installed=$stamp"
    echo "base=$base"
    echo "skills_dir=$skills_dir"
    echo "rules=$rules"
    echo "rules_existed=${rules_existed:-0}"
    echo "rules_backup=$rules_backup"
    echo "scope=$scope"
    printf '%s' "$2"
    printf '%s' "$created" | grep -v -e '^created_dir=\.makkov-harness$' -e '^created_dir=\.makkov-harness/' || true
    printf '%s\n' "$1" | grep '^skill=' | awk '!seen[$0]++' || true
  } > "$manifest.new"
  mv "$manifest.new" "$manifest"
}

if [ "$dry" = 1 ]; then
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    dst="$skills_dir/$name"
    if [ ! -e "$dst" ]; then echo "  would copy $name to $dst"; continue; fi
    fp_old="$(mh_fingerprint "$dst")"
    if [ "$fp_old" = "$(fp_of "$name")" ]; then :
    elif printf '%s' "$earlier" | grep -qx "skill=$name $fp_old"; then echo "  would update $dst (a copy this harness put there)"
    elif printf '%s' "$earlier" | grep -qx "skill=$name"; then echo "  would move $dst (from an install before 0.5.0) to $backup_root/earlier-harness/$name"
    else echo "  would move your $dst to $backup_root/skills/$name, then copy ours"; fi
  done < <(printf '%s' "$names")
  [ "$need_copy" = 1 ] && echo "  would keep a copy of $rules as it is now in $original"
  if [ -f "$rules" ]; then
    if [ "$agent" = "cursor" ]; then echo "  would rewrite $rules with the routing rule"
    elif grep -q "$MH_START" "$rules"; then echo "  would update the marked routing block in $rules"
    else echo "  would append the marked routing block to $rules"; fi
  else
    echo "  would create $rules with the routing block"
  fi
  echo "Dry run done for $agent. Run again without --dry-run to install."
  exit 0
fi

# The journal: before the first change, the manifest already lists the folders and backups this run may leave
# behind and the earlier install's skills. Each skill of this version is added to it once it is in place, so
# a skill of yours the run did not reach is never taken for the harness's.
write_manifest "$old_skills" "${old_backups}backup=$backup_root/skills
"
rm -f "$state"/install-*.txt.new "$rules.mh-tmp" "$original.mh-tmp"

# 1. Skills.
# - a copy that is already exactly ours is left as it is;
# - the copy an earlier install of this harness put there is replaced;
# - a folder an install from before 0.5.0 put there (no fingerprint recorded, so it may have been edited) is
#   moved to backups/<date>/earlier-harness/ and left there;
# - anything else (your own skill, or ours that you edited) is moved to backups/<date>/skills/ and put back
#   by the uninstaller. Nothing is deleted that might be yours.
# Each copy goes to a temporary name first and is then renamed, so an interrupted copy is never taken for yours.
copied="" backed="" older="" dropped=""
if [ -n "$skills_dir" ]; then
  mkdir -p "$skills_dir"
  for t in "$skills_dir"/.mh-tmp-*; do [ -e "$t" ] && rm -rf "${t:?}"; done
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    dst="$skills_dir/$name"
    copy=1
    if [ -e "$dst" ] || [ -L "$dst" ]; then
      fp_old="$(mh_fingerprint "$dst")"
      if [ "$fp_old" = "$(fp_of "$name")" ]; then
        copy=0
      elif [ "$fp_old" != "$MH_EMPTY_FP" ] && printf '%s' "$earlier" | grep -qx "skill=$name $fp_old"; then
        mh_drop "$dst"
      elif printf '%s' "$earlier" | grep -qx "skill=$name"; then
        mkdir -p "$backup_root/earlier-harness"; mv "$dst" "$backup_root/earlier-harness/$name"
        older="$older $name"
      else
        mkdir -p "$backup_root/skills"; mv "$dst" "$backup_root/skills/$name"
        backed="$backed $name"
      fi
    fi
    # Recorded before the copy goes in (your folder, if any, is already aside): a copy in place is always listed.
    printf 'skill=%s %s\n' "$name" "$(fp_of "$name")" >> "$manifest"
    if [ "$copy" = 1 ]; then cp -R "$repo/skills/$name" "$skills_dir/.mh-tmp-$name"; mv "$skills_dir/.mh-tmp-$name" "$dst"; fi
    copied="$copied $name"
    [ -z "$copied" ] || checkpoint skill
  done < <(printf '%s' "$names")

  # Skills the earlier install of this agent put there that this version no longer has (removed or renamed):
  # removed while still exactly as installed, moved to backups/<date>/removed/ if you changed them,
  # to backups/<date>/earlier-harness/ if the install was from before 0.5.0. Another agent's copy stays.
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    entry="${line#skill=}"; name="${entry%% *}"; fp=""; [ "$entry" != "$name" ] && fp="${entry#* }"
    printf '%s' "$manifest_skills" | grep -q "^skill=$name " && continue
    case " $dropped " in *" $name "*) continue ;; esac
    dst="$skills_dir/$name"
    [ -e "$dst" ] || continue
    if ! mh_skill_folder "$name" "$dst"; then echo "  leave $dst (no SKILL.md in it, so not a skill folder the harness put there)"; continue; fi
    other=0
    for m in "$state"/install-*.txt; do
      [ "$m" = "$manifest" ] || [ ! -f "$m" ] && continue
      [ "$(mh_get "$m" skills_dir "$base")" = "$skills_dir" ] && mh_cat "$m" | grep -Eq "^skill=$name( |$)" && other=1
    done
    if [ "$other" = 1 ]; then echo "  keep $dst (no longer part of the harness, but another installed agent lists it)"; continue; fi
    fp_now="$(mh_fingerprint "$dst")"
    if [ -n "$fp" ] && [ "$fp_now" != "$MH_EMPTY_FP" ] && printf '%s\n' "$old_skills" | grep -qxF "skill=$name $fp_now"; then
      mh_drop "$dst"
    elif [ -n "$fp" ]; then
      mkdir -p "$backup_root/removed"; mv "$dst" "$backup_root/removed/$name"
    else
      mkdir -p "$backup_root/earlier-harness"; mv "$dst" "$backup_root/earlier-harness/$name"
    fi
    dropped="$dropped $name"
  done < <(printf '%s\n' "$old_skills")
fi
checkpoint skills

# 2. Routing block.
routing="$(sed 's/`rich-report` (Claude with Artifacts) or `html-report` (any agent)/`html-report`/' "$repo/ROUTING.md")"
if [ "$scope" = design ]; then
  # Design work only: drop the rows that route research, installs and general coding.
  routing="$(printf '%s\n' "$routing" | grep -v -e '^| Research, analysis' -e '^| Installing, adding' -e '^| Any new feature or creative work' -e '^| Whole-project security review')"
  routing="$routing

Scope: design work only (installed with --scope design). For research, installs and general coding, work as you would without this harness."
fi
MH_BLOCK="$MH_START
$routing
$MH_END"
mkdir -p "$(dirname "$rules")"
new="$(mktemp)"
if [ "$agent" = "cursor" ]; then
  printf -- '---\ndescription: makkov-harness routing - which skill fits which situation\nalwaysApply: true\n---\n%s\n' "$MH_BLOCK" > "$new"
elif [ -f "$rules" ] && grep -q "$MH_START" "$rules"; then
  mh_replace_block "$rules" > "$new"
elif [ -s "$rules" ]; then
  # Appended after one blank line; a file that does not end in a newline gets one first.
  { cat "$rules"; [ -n "$(tail -c 1 "$rules")" ] && echo; printf '\n%s\n' "$MH_BLOCK"; } > "$new"
else
  printf '%s\n' "$MH_BLOCK" > "$new"
fi
if [ -f "$rules" ] && cmp -s "$new" "$rules"; then
  :   # already up to date: the file is not touched
else
  if [ "$need_copy" = 1 ]; then
    # A plain copy (not read-only, even if the file is), made under a new name with an exclusive create and renamed
    # into place: never written through a link.
    mkdir -p "$(dirname "$original")"; rm -f "$original.mh-tmp"
    (set -C; cat > "$original.mh-tmp") < "$rules"; mv -f "$original.mh-tmp" "$original"
  fi
  mh_write_through "$rules" < "$new"
fi
rm -f "$new"
checkpoint rules

# 3. The manifest, as it now stands.
final_backups="$old_backups"; [ -n "$backed" ] && final_backups="${final_backups}backup=$backup_root/skills
"
write_manifest "$manifest_skills" "$final_backups"

echo "makkov-harness installed for $agent"
[ -n "$skills_dir" ] && echo "Skills -> $skills_dir :$copied"
[ -n "$backed" ] && echo "Kept your earlier versions of:$backed -> $backup_root/skills"
[ -n "$older" ] && echo "Moved the copies an install before 0.5.0 left of:$older -> $backup_root/earlier-harness (delete them if you never edited them)"
[ -n "$dropped" ] && echo "No longer part of the harness, taken out of $skills_dir:$dropped"
echo "Routing -> $rules"
[ "$agent" = "aider" ] && echo "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project."
echo "Restart the agent, then run the harness-onboarding skill to personalize it."
exit 0
