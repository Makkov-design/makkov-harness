# Lessons

Engineering lessons from work on this repository: what went wrong or nearly did, and the rule that prevents it next time. Newest first; append, do not rewrite.

## 2026-11-23 · Install gate and scanner coverage

- **A regex answers "is there any match", not "is this the right parse".** POSIX ERE (what bash `=~` uses) finds a match if *any* reading fits. An option that may take a value (`npm install --prefix app`) can always be read as a flag followed by a package, so alternation cannot exclude it. Rewrite such options into one word first (`--prefix=app`), then match. Do the rewrite case-sensitively: `-w` and `-W` differ.
- **Decode JSON escapes in the right order.** Set escaped backslashes aside before turning `\n` into a separator, or `\` + newline (a line continuation) and a literal `\n` in a `printf` both decode wrong. Do not use `$'\001'` as the placeholder: bash uses that byte internally (CTLESC); `$'\037'` is safe.
- **A shell runs its stdin; most interpreters do only without a script.** `curl … | bash -s -- --yes` runs the download, `curl … | python3 -m json.tool` only reads it. Match shells with any options, and python/node/perl/ruby only when bare or given `-`.
- **Two checks that encode the same knowledge drift unless one data file feeds both.** The gate (commands) and the scanner (file text) now read `hooks/install-corpus.json`, with one invariant: a command the scanner flags must make the gate ask. Add a real-world command there first, then fix whichever check disagrees.
- **Messages are text, but a command substitution in a message still runs.** Blank quoted `-m`/`--body` values, except when they contain `$(` or a backtick, with the usual `"$(cat <<'EOF' … EOF)"` commit message as the one exception.
- **Hidden-Unicode rules need an allowlist for real text.** A leading BOM and the zero-width joiner inside emoji sequences are everyday content; exempt exactly those shapes and test that the same characters elsewhere are still caught.
- **Where bash 3.2 cannot run locally, the macOS CI job is the check.** Building bash 3.2 from source was not possible in the cloud session; keep to bash 3.2 features (no `${x,,}`, no `declare -A`, no `mapfile`) and read the macOS job's result before merging.
