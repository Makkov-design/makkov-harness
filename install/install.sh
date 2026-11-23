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
state="$base/.makkov-harness"
manifest="$state/install-$agent.txt"
backup_root="$state/backups/$stamp"
[ "$dry" = 1 ] && echo "Dry run: nothing will be written."

# 0. Before anything is written: the earlier install of this agent (its manifest, read with its paths moved
#    onto this folder if the folder was moved or renamed since), and markers the rewrite can trust.
rules_existed=0 rules_backup="" old_backups="" old_created="" old_skills=""
if [ -f "$manifest" ]; then
  rules_existed="$(mh_raw "$manifest" rules_existed)"; rules_backup="$(mh_get "$manifest" rules_backup "$base")"
  ob="$(mh_old_base "$manifest")"
  while IFS= read -r b; do [ -n "$b" ] && old_backups="${old_backups}backup=$(mh_rebase "$b" "$ob" "$base")
"; done < <(sed -n 's/^backup=//p' "$manifest")
  old_created="$(grep '^created_dir=' "$manifest" || true)"
  old_skills="$(grep '^skill=' "$manifest" || true)"
  if [ "$scope_given" = 0 ]; then scope="$(mh_raw "$manifest" scope)"; [ "$scope" = design ] && echo "Scope: design (kept from the earlier install; pass --scope all to change it)"; fi
fi
case "$scope" in all|design) ;; *) scope=all ;; esac
# Another agent installed into the same instructions file (Codex, Copilot, Windsurf, Cline and OpenCode all use
# <project>/AGENTS.md): this install shares its record of whether the file was yours before the harness.
if [ ! -f "$manifest" ] && [ -d "$state" ]; then
  for m in "$state"/install-*.txt; do
    [ -f "$m" ] || continue
    if [ "$(mh_get "$m" rules "$base")" = "$rules" ]; then
      rules_existed="$(mh_raw "$m" rules_existed)"; rules_backup="$(mh_get "$m" rules_backup "$base")"; break
    fi
  done
fi
if [ ! -f "$manifest" ] && [ -z "$rules_backup" ] && [ -f "$rules" ] && ! grep -q "$MH_START" "$rules"; then rules_existed=1; fi
[ "$agent" = cursor ] || mh_check_markers "$rules" || exit 1

# What earlier installs into this skills folder put there, from every manifest that points at it.
earlier=""
if [ -n "$skills_dir" ] && [ -d "$state" ]; then
  for m in "$state"/install-*.txt; do
    [ -f "$m" ] || continue
    [ "$(mh_get "$m" skills_dir "$base")" = "$skills_dir" ] && earlier="$earlier$(grep '^skill=' "$m")
"
  done
fi
# Folders this install creates, so the uninstaller can take them away again once they are empty.
created="$old_created"
add_created() { local d; while IFS= read -r d; do [ -n "$d" ] && ! printf '%s\n' "$created" | grep -qxF "created_dir=$d" && created="${created}created_dir=$d
"; done < <(mh_missing_dirs "$1" "$base"); return 0; }

# 1. Skills (rich-report needs Claude Artifacts, so it is skipped here).
# - a copy that is already exactly ours is left as it is;
# - the copy an earlier install of this harness put there is replaced;
# - a folder an install from before 0.5.0 put there (no fingerprint recorded, so it may have been edited) is
#   moved to backups/<date>/earlier-harness/ and left there;
# - anything else (your own skill, or ours that you edited) is moved to backups/<date>/skills/ and put back
#   by the uninstaller. Nothing is deleted that might be yours.
copied="" backed="" older="" dropped=""
manifest_skills=""
if [ -n "$skills_dir" ]; then
  if [ "$dry" = 0 ]; then add_created "$skills_dir"; mkdir -p "$skills_dir"; fi
  for d in "$repo"/skills/*/; do
    name="$(basename "$d")"
    [ "$name" = "rich-report" ] && continue
    fp_new="$(mh_fingerprint "${d%/}")"
    dst="$skills_dir/$name"
    copy=1
    if [ -e "$dst" ]; then
      fp_old="$(mh_fingerprint "$dst")"
      if [ "$fp_old" = "$fp_new" ]; then
        copy=0
      elif printf '%s' "$earlier" | grep -qx "skill=$name $fp_old"; then
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
    [ "$dry" = 1 ] || [ "$copy" = 0 ] || cp -R "${d%/}" "$dst"
    copied="$copied $name"
    manifest_skills="${manifest_skills}skill=$name $fp_new
"
  done

  # Skills the earlier install of this agent put there that this version no longer has (removed or renamed):
  # removed while still exactly as installed, moved to backups/<date>/removed/ if you changed them,
  # to backups/<date>/earlier-harness/ if the install was from before 0.5.0. Another agent's copy stays.
  old_skills_dir="$( [ -f "$manifest" ] && mh_get "$manifest" skills_dir "$base" || true)"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    entry="${line#skill=}"; name="${entry%% *}"; fp=""; [ "$entry" != "$name" ] && fp="${entry#* }"
    printf '%s' "$manifest_skills" | grep -q "^skill=$name " && continue
    [ "$old_skills_dir" = "$skills_dir" ] || continue
    dst="$skills_dir/$name"
    [ -e "$dst" ] || continue
    other=0
    for m in "$state"/install-*.txt; do
      [ "$m" = "$manifest" ] || [ ! -f "$m" ] && continue
      [ "$(mh_get "$m" skills_dir "$base")" = "$skills_dir" ] && grep -q "^skill=$name\( \|$\)" "$m" && other=1
    done
    if [ "$other" = 1 ]; then echo "  keep $dst (no longer part of the harness, but another installed agent lists it)"; continue; fi
    if [ -n "$fp" ] && [ "$(mh_fingerprint "$dst")" = "$fp" ]; then
      if [ "$dry" = 1 ]; then echo "  would remove $dst (no longer part of the harness)"; else rm -rf "${dst:?}"; fi
    elif [ -n "$fp" ]; then
      if [ "$dry" = 1 ]; then echo "  would move $dst (no longer part of the harness; you changed it) to $backup_root/removed/$name"
      else mkdir -p "$backup_root/removed"; mv "$dst" "$backup_root/removed/$name"; fi
    else
      if [ "$dry" = 1 ]; then echo "  would move $dst (no longer part of the harness, from an install before 0.5.0) to $backup_root/earlier-harness/$name"
      else mkdir -p "$backup_root/earlier-harness"; mv "$dst" "$backup_root/earlier-harness/$name"; fi
    fi
    dropped="$dropped $name"
  done < <(printf '%s\n' "$old_skills")
fi

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
# The file before the harness first changed it is kept once, as .makkov-harness/backups/original/<path>.
# The uninstaller uses it to put the file back exactly as it was.
rel_rules="$(mh_rel "$rules" "$base")"
original="$state/backups/original/$rel_rules"
if [ "$dry" = 1 ]; then
  if [ -f "$rules" ]; then
    [ "$rules_existed" = 1 ] && [ -z "$rules_backup" ] && echo "  would keep a copy of $rules as it is now in $original"
    if [ "$agent" = "cursor" ]; then echo "  would rewrite $rules with the routing rule"
    elif grep -q "$MH_START" "$rules"; then echo "  would update the marked routing block in $rules"
    else echo "  would append the marked routing block to $rules"; fi
  else
    echo "  would create $rules with the routing block"
  fi
  echo "Dry run done for $agent. Run again without --dry-run to install."
  exit 0
fi
add_created "$(dirname "$rules")"
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
  if [ -f "$rules" ] && [ "$rules_existed" = 1 ] && [ -z "$rules_backup" ]; then
    add_created "$(dirname "$original")"; mkdir -p "$(dirname "$original")"; cp -p "$rules" "$original"; rules_backup="$original"
  fi
  if [ -f "$rules" ]; then mh_write_through "$rules" < "$new"; else cat "$new" > "$rules"; fi
fi
rm -f "$new"

# 3. Manifest: what this install put where, so install/uninstall.sh removes exactly that.
# Paths are absolute; base= says which folder they were written for, so a moved folder can still be read.
add_created "$state"
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
  printf '%s' "$old_backups"
  [ -n "$backed" ] && echo "backup=$backup_root/skills"
  printf '%s' "$created" | grep -v -e '^created_dir=\.makkov-harness$' -e '^created_dir=\.makkov-harness/' || true
  printf '%s' "$manifest_skills"
} > "$manifest"

echo "makkov-harness installed for $agent"
[ -n "$skills_dir" ] && echo "Skills -> $skills_dir :$copied"
[ -n "$backed" ] && echo "Kept your earlier versions of:$backed -> $backup_root/skills"
[ -n "$older" ] && echo "Moved the copies an install before 0.5.0 left of:$older -> $backup_root/earlier-harness (delete them if you never edited them)"
[ -n "$dropped" ] && echo "No longer part of the harness, taken out of $skills_dir:$dropped"
echo "Routing -> $rules"
[ "$agent" = "aider" ] && echo "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project."
echo "Restart the agent, then run the harness-onboarding skill to personalize it."
exit 0
