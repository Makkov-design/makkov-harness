# Shared by install.sh and uninstall.sh. Sourced, not run. Works in bash 3.2 (macOS).
# install/lib.ps1 is the PowerShell twin: keep the two in step, rule for rule.

# Text tools work on bytes, not characters: a file in Windows-1251 or with invalid UTF-8 would make awk and sed
# in a UTF-8 locale (macOS) stop or skip lines. In the C locale every byte passes through as it is.
LC_ALL=C; export LC_ALL

MH_AGENTS='codex|cursor|gemini|copilot|windsurf|cline|opencode|aider'
MH_START='<!-- makkov-harness:start -->'
MH_END='<!-- makkov-harness:end -->'

# A fingerprint of a folder: the checksum of every file's checksum, size and path.
mh_fingerprint() { (cd "$1" && find . -type f -exec cksum {} + | LC_ALL=C sort) | cksum | cut -d' ' -f1; }

# The first value of key=... in a manifest, as written.
# A manifest as the bash installer reads it: without a byte order mark or carriage returns, and with Windows
# paths (C:\x, as install.ps1 writes them) in the form this shell uses (/c/x in Git Bash, /mnt/c/x in WSL; set
# MH_DRV to /mnt/ for the second). So a manifest written by either installer is read by both.
MH_DRV="/"
mh_cat() {
  sed "1s/^$(printf '\357\273\277')//" "$1" | tr -d '\r' | awk -v drv="$MH_DRV" '
    /^(base|skills_dir|rules|rules_backup|backup)=/ {
      i = index($0, "="); k = substr($0, 1, i); v = substr($0, i + 1)
      if (v ~ /\\/ || v ~ /^[A-Za-z]:/) { gsub(/\\/, "/", v)
        if (v ~ /^[A-Za-z]:\//) v = drv tolower(substr(v, 1, 1)) substr(v, 3) }
      print k v; next }
    { print }'
}
# Sets MH_DRV from the folder being worked on (call once the base is known).
mh_drive_form() { case "$1" in /mnt/[a-z]/*) MH_DRV="/mnt/" ;; *) MH_DRV="/" ;; esac; }

# Deletes a skill folder the harness put there: renamed first to a temporary name (.mh-tmp-old-<name>, which
# install and uninstall clear), so an interrupted delete never leaves a half-deleted folder under the skill's name.
mh_drop() { local t; t="$(dirname "$1")/.mh-tmp-old-$(basename "$1")"; rm -rf "${t:?}"; mv "$1" "$t" && rm -rf "${t:?}"; }

# The first value of key=... in a manifest, as written (after mh_cat).
mh_raw() { mh_cat "$1" | sed -n "s/^$2=//p" | head -n 1; }

# The folder a manifest was written for. New manifests say it (base=); older ones are read back from the
# skills folder (<base>/.agents/skills or <base>/.cline/skills) or, for Aider, from <base>/CONVENTIONS.md.
mh_old_base() {
  local b s r
  b="$(mh_raw "$1" base)"
  if [ -n "$b" ]; then printf '%s' "$b"; return; fi
  s="$(mh_raw "$1" skills_dir)"
  case "$s" in
    */.agents/skills) printf '%s' "${s%/.agents/skills}"; return ;;
    */.cline/skills)  printf '%s' "${s%/.cline/skills}"; return ;;
  esac
  r="$(mh_raw "$1" rules)"
  case "$r" in */CONVENTIONS.md) printf '%s' "${r%/CONVENTIONS.md}"; return ;; esac
}

# A path from a manifest, moved onto the current base when the home or project folder was moved or
# renamed since the install: <old base>/x becomes <base>/x. Paths outside the old base stay as written.
# Usage: mh_rebase <path> <old base> <base>
mh_rebase() {
  local p="$1" ob="$2" nb="$3"
  if [ -n "$p" ] && [ -n "$ob" ] && [ "$ob" != "$nb" ]; then
    case "$p" in "$ob"/*) p="$nb/${p#"$ob"/}" ;; "$ob") p="$nb" ;; esac
  fi
  printf '%s' "$p"
}

# A path-valued key of a manifest, rebased. Usage: mh_get <manifest> <key> <base>
mh_get() { mh_rebase "$(mh_raw "$1" "$2")" "$(mh_old_base "$1")" "$3"; }

# Checks the marked blocks in an instructions file before anything is rewritten: every start marker has its
# end marker after it, no block opens inside another, and there is at most one routing block. Prints what is
# wrong and returns 1 otherwise. Usage: mh_check_markers <file>
mh_check_markers() {
  [ -f "$1" ] || return 0
  local why
  why="$(awk '
    /<!-- makkov-harness:start -->/          { if (open != "") { print "line " NR ": a routing block starts inside another marked block"; exit }
                                               open = "main"; at = NR; mains++
                                               if (mains > 1) { print "line " NR ": a second routing block"; exit } next }
    /<!-- makkov-harness:personal:start -->/ { if (open != "") { print "line " NR ": a personal layer starts inside another marked block"; exit }
                                               open = "personal"; at = NR; next }
    /<!-- makkov-harness:end -->/            { if (open != "main") { print "line " NR ": an end marker with no routing block open"; exit } open = ""; next }
    /<!-- makkov-harness:personal:end -->/   { if (open != "personal") { print "line " NR ": a personal end marker with no personal layer open"; exit } open = ""; next }
    END { if (open == "main") print "line " at ": a routing block with no end marker"
          else if (open == "personal") print "line " at ": a personal layer with no end marker" }' "$1")" ||
    why="it could not be read"
  [ -z "$why" ] && return 0
  echo "$1: the makkov-harness markers are not paired ($why)." >&2
  echo "Nothing was changed. Fix or delete the marked lines by hand, then run this again." >&2
  return 1
}

# Writes stdin into a file. A regular file is replaced in one step: a copy of it (so it keeps its mode) takes the
# new content as <file>.mh-tmp and is renamed over it, so an interruption leaves the old file or the new one,
# never half of one (install and uninstall clear a .mh-tmp left behind). A symlink is written through in place,
# so it stays a symlink; so is a file with more than one hard link, so every name keeps the same file.
mh_write_through() {
  local t
  if [ -L "$1" ] || [ -n "$(find "$1" -prune -links +1 2>/dev/null)" ]; then t="$(mktemp)"; cat > "$t"; cat "$t" > "$1"; rm -f "$t"; return 0; fi
  t="$1.mh-tmp"; rm -f "$t"
  if [ -f "$1" ]; then cp -p "$1" "$t"; fi
  cat > "$t" && mv -f "$t" "$1"
}

# The file with the routing block replaced by $MH_BLOCK (exported by the caller). Lines outside the block
# are kept as they are.
mh_replace_block() {
  BLK="$MH_BLOCK" awk '
    /<!-- makkov-harness:start -->/ { print ENVIRON["BLK"]; skip = 1; next }
    /<!-- makkov-harness:end -->/   { skip = 0; next }
    !skip { print }' "$1"
}

# The file with the routing block and the personal layer taken out, each with the one blank line before it that
# the installer (or harness-onboarding) put there when it appended the block. Every other line stays as it is.
mh_remove_blocks() {
  awk '
    /<!-- makkov-harness:(personal:)?start -->/ { if (n > 0 && line[n] ~ /^[ \t\r]*$/) n--; skip = 1; next }
    /<!-- makkov-harness:(personal:)?end -->/   { skip = 0; next }
    !skip { line[++n] = $0 }
    END { for (i = 1; i <= n; i++) print line[i] }' "$1"
}

# The personal layer of a file, markers included (empty when there is none).
mh_personal_layer() {
  awk '/<!-- makkov-harness:personal:start -->/ { on = 1 } on { print } /<!-- makkov-harness:personal:end -->/ { on = 0 }' "$1"
}

# A path relative to the base, for created_dir= lines (always with / separators).
mh_rel() { case "$1" in "$2"/*) printf '%s' "${1#"$2"/}" ;; *) printf '%s' "$1" ;; esac; }

# The folders between the base and a folder that do not exist yet, deepest first, relative to the base.
# Usage: mh_missing_dirs <dir> <base>
mh_missing_dirs() {
  local d="$1"
  while [ -n "$d" ] && [ "$d" != "$2" ] && [ "$d" != "/" ] && [ ! -e "$d" ]; do
    case "$d" in "$2"/*) ;; *) return 0 ;; esac
    mh_rel "$d" "$2"; echo
    d="$(dirname "$d")"
  done
}

# Where each agent's skills and instructions file go: sets MH_SKILLS and MH_RULES.
# Usage: mh_paths <agent> <project, or empty for a user-level install>
mh_paths() {
  local a="$1" p="$2" b="${2:-$HOME}"
  case "$a" in cline) MH_SKILLS="$b/.cline/skills" ;; aider) MH_SKILLS="" ;; *) MH_SKILLS="$b/.agents/skills" ;; esac
  case "$a" in
    codex)    MH_RULES="${p:+$p/AGENTS.md}";  MH_RULES="${MH_RULES:-$HOME/.codex/AGENTS.md}" ;;
    gemini)   MH_RULES="${p:+$p/GEMINI.md}";  MH_RULES="${MH_RULES:-$HOME/.gemini/GEMINI.md}" ;;
    opencode) MH_RULES="${p:+$p/AGENTS.md}";  MH_RULES="${MH_RULES:-$HOME/.config/opencode/AGENTS.md}" ;;
    cline)    MH_RULES="${p:+$p/AGENTS.md}";  MH_RULES="${MH_RULES:-$HOME/.agents/AGENTS.md}" ;;
    cursor)   MH_RULES="$p/.cursor/rules/makkov-harness.mdc" ;;
    aider)    MH_RULES="$p/CONVENTIONS.md" ;;
    *)        MH_RULES="$p/AGENTS.md" ;;
  esac
}

# A path with . or .. among its parts (never written by the installer).
mh_dotdot() { case "/$1/" in */../*|*/./*) return 0 ;; esac; return 1; }

# A path lies inside the base: below it as written, with no .. and no symlink on the way (itself included).
mh_inside() {
  local p="$1" b="$2" rest d
  case "$p" in "$b"/*) ;; *) return 1 ;; esac
  mh_dotdot "$p" && return 1
  rest="${p#"$b"/}/" d="$b"
  while [ -n "$rest" ]; do
    d="$d/${rest%%/*}"; rest="${rest#*/}"
    [ -L "$d" ] && return 1
  done
  return 0
}

# A manifest is input the installer does not trust: someone may have edited it, or it came with a cloned
# repository. It is used only when it names exactly the paths the installer itself would use for that agent
# in this folder, its backups lie in .makkov-harness/backups/ and its skill names are plain folder names.
# Prints why not and returns 1 otherwise. Usage: mh_valid_manifest <manifest> <base> <project, or empty>
mh_valid_manifest() {
  local m="$1" base="$2" proj="$3" st="$2/.makkov-harness" a ob v line rel
  a="$(mh_raw "$m" agent)"
  case "$a" in codex|cursor|gemini|copilot|windsurf|cline|opencode|aider) ;; *) echo "it names no agent"; return 1 ;; esac
  [ "$(basename "$m")" = "install-$a.txt" ] || { echo "it is for $a, not for its file name"; return 1; }
  mh_cat "$m" | grep -q '^rules=.' || { echo "it names no instructions file"; return 1; }
  mh_paths "$a" "$proj"
  ob="$(mh_old_base "$m")"
  [ "$(mh_rebase "$(mh_raw "$m" rules)" "$ob" "$base")" = "$MH_RULES" ] || { echo "its instructions file is not the one $a uses here"; return 1; }
  [ "$(mh_rebase "$(mh_raw "$m" skills_dir)" "$ob" "$base")" = "$MH_SKILLS" ] || { echo "its skills folder is not the one $a uses here"; return 1; }
  v="$(mh_rebase "$(mh_raw "$m" rules_backup)" "$ob" "$base")"
  if [ -n "$v" ]; then
    case "$v" in
      "$st/backups/original/"*) mh_dotdot "$v" && { echo "its copy of the instructions file is outside the harness folder"; return 1; }
                                mh_inside "$v" "$base" || { echo "its copy of the instructions file is outside $base"; return 1; } ;;
      "$MH_RULES".bak-*) case "${v#"$MH_RULES".bak-}" in */*) echo "its copy of the instructions file is not next to the file"; return 1 ;; esac ;;
      *) echo "its copy of the instructions file is not one the installer makes"; return 1 ;;
    esac
  fi
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    v="$(mh_rebase "$line" "$ob" "$base")"
    case "$v" in "$st/backups/"?*) ;; *) echo "a backup folder outside .makkov-harness/backups"; return 1 ;; esac
    mh_dotdot "$v" && { echo "a backup folder with .. in its path"; return 1; }
    mh_inside "$v" "$base" || { echo "a backup folder outside $base"; return 1; }
  done < <(mh_cat "$m" | sed -n 's/^backup=//p')
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    printf '%s\n' "$line" | grep -Eq '^[A-Za-z0-9._-]+( [0-9a-f]+)?$' || { echo "a skill entry that is not a plain folder name"; return 1; }
    case "${line%% *}" in .|..) echo "a skill entry that is not a plain folder name"; return 1 ;; esac
  done < <(mh_cat "$m" | sed -n 's/^skill=//p')
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    case "$rel" in /*) echo "a created folder given as an absolute path"; return 1 ;; esac
    mh_dotdot "$rel" && { echo "a created folder with .. in its path"; return 1; }
    # A folder on the way to any agent's skills or instructions folder here: an uninstall hands a folder still
    # in use on to the other installs in the folder, whichever agent created it.
    v="$base/$rel"; ok=0
    for x in codex cursor gemini copilot windsurf cline opencode aider; do
      [ -z "$proj" ] && case "$x" in cursor|copilot|windsurf|aider) continue ;; esac
      mh_paths "$x" "$proj"
      case "$MH_SKILLS/" in "$v"/*) ok=1 ;; esac
      case "$(dirname "$MH_RULES")/" in "$v"/*) ok=1 ;; esac
    done
    [ "$ok" = 1 ] || { echo "a created folder the installer would not create"; return 1; }
  done < <(mh_cat "$m" | sed -n 's/^created_dir=//p')
  return 0
}

# Checks that a file can be changed in place: absent (with a folder it can be created in), or a regular file,
# or a symlink to one, that can be written. Prints why not and returns 1 otherwise.
mh_writable_file() {
  local f="$1" d
  if [ -L "$f" ] && [ ! -e "$f" ]; then echo "$f is a symlink to $(readlink "$f"), which does not exist"; return 1; fi
  if [ -e "$f" ]; then
    [ -f "$f" ] || { echo "$f is not a regular file"; return 1; }
    [ -w "$f" ] || { echo "$f is read-only"; return 1; }
    return 0
  fi
  mh_writable_dir "$(dirname "$f")"
}
# Checks that a folder exists and can be written to, or can be created.
mh_writable_dir() {
  local d="$1"
  if [ -e "$d" ] || [ -L "$d" ]; then
    [ -d "$d" ] || { echo "$d is not a folder"; return 1; }
    [ -w "$d" ] || { echo "$d is read-only"; return 1; }
    return 0
  fi
  while [ ! -e "$d" ] && [ ! -L "$d" ]; do d="$(dirname "$d")"; done
  [ -d "$d" ] || { echo "$d is not a folder"; return 1; }
  [ -w "$d" ] || { echo "$d is read-only"; return 1; }
}

# A file in UTF-16 or UTF-32 (a byte order mark says so): the harness would corrupt it, so it stops instead.
mh_wide_text() {
  [ -f "$1" ] || return 1
  case "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" in fffe*|feff*|0000feff) return 0 ;; esac
  return 1
}

# The file after the harness's blocks are taken out is the file as it was: the same bytes, or the same plus the
# one newline the installer added to a file that did not end in one. Any other difference is an edit of yours.
mh_same_text() { cmp -s "$1" "$2" || { [ -s "$2" ] && [ -n "$(tail -c 1 "$2")" ] && { cat "$2"; echo; } | cmp -s "$1" -; }; }
