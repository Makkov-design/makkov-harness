# Shared by install.sh and uninstall.sh. Sourced, not run. Works in bash 3.2 (macOS).
# install/lib.ps1 is the PowerShell twin: keep the two in step, rule for rule.

MH_AGENTS='codex|cursor|gemini|copilot|windsurf|cline|opencode|aider'
MH_START='<!-- makkov-harness:start -->'
MH_END='<!-- makkov-harness:end -->'

# A fingerprint of a folder: the checksum of every file's checksum, size and path.
mh_fingerprint() { (cd "$1" && find . -type f -exec cksum {} + | LC_ALL=C sort) | cksum | cut -d' ' -f1; }

# The first value of key=... in a manifest, as written.
mh_raw() { sed -n "s/^$2=//p" "$1" | head -n 1; }

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
          else if (open == "personal") print "line " at ": a personal layer with no end marker" }' "$1")"
  [ -z "$why" ] && return 0
  echo "$1: the makkov-harness markers are not paired ($why)." >&2
  echo "Nothing was changed. Fix or delete the marked lines by hand, then run this again." >&2
  return 1
}

# Writes stdin into an existing file in place, so a symlink stays a symlink and the file keeps its mode.
mh_write_through() { local t; t="$(mktemp)"; cat > "$t"; cat "$t" > "$1"; rm -f "$t"; }

# The file with the routing block replaced by $MH_BLOCK (exported by the caller). Lines outside the block
# are kept as they are.
mh_replace_block() {
  BLK="$MH_BLOCK" awk '
    /<!-- makkov-harness:start -->/ { print ENVIRON["BLK"]; skip = 1; next }
    /<!-- makkov-harness:end -->/   { skip = 0; next }
    !skip { print }' "$1"
}

# The file with the routing block and the personal layer taken out. When nothing but blank lines follows the
# last block taken out, the blank lines before it go too (the installer put one there when it appended).
mh_remove_blocks() {
  awk '
    /<!-- makkov-harness:(personal:)?start -->/ { skip = 1; next }
    /<!-- makkov-harness:(personal:)?end -->/   { skip = 0; last = n; cut = 1; next }
    !skip { line[++n] = $0 }
    END {
      if (cut) { tail = 1; for (i = last + 1; i <= n; i++) if (line[i] !~ /^[ \t\r]*$/) tail = 0
                 if (tail) while (n > 0 && line[n] ~ /^[ \t\r]*$/) n-- }
      for (i = 1; i <= n; i++) print line[i]
    }' "$1"
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
