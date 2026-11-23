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

## 2026-11-23 · Install gate audit, round 1

- **A regex change ships with a worst-case timing test, or not at all.** An optional path prefix (`[^ ]*/`) put in front of every program name made the gate quadratic on one long word: 20 KB took 2.5 s, and at the hook's 5-second timeout Claude Code runs the command without asking. A hook that fails open must have hard size limits (cut long words, ask above a length) and a test that feeds it 100 KB of hostile shapes with a time bound. The same holds for the scanner: an unbounded line join turned a 1 MB file of `\`-continued lines into minutes.
- **A "pass" rule added to cut false positives is an attack surface; write it from the shell's grammar, not from text shapes.** Blanking `-m "…"` wherever it appeared let `echo "step -m " && npm install evil && echo " done"` through, because the regex paired the wrong quotes. A pass rule needs the quoting state (the quote must be outside any other quote), the command it belongs to (git/gh/echo only), and the data flow (not piped, not inside `$( )`). Where any of that is unknown, ask.
- **An exemption must list the real values, not their shape.** "Black flag + 1–6 tag letters + cancel" was meant for England, Scotland and Wales and let any hidden text through in six-letter chunks. Allow exactly the known sequences and test that a near miss is still caught.
- **Write install patterns from the vendors' own one-liners.** `| INSTALL_K3S_VERSION=v1.30 sh -`, `| python3 - --version 1.8.0`, a URL with `&` in quotes and a pipe at the end of a line all come straight from real install pages and all passed. Collect them into the corpus first.
- **One option table for four tools is a bug.** `-w` takes a value in npm and none in pnpm; joining it everywhere hid `pnpm add -w zod`. Check every value-taking option per tool.
- **Every pattern alternation needs a corpus row.** A mutation run deleted nine alternations without a failing test. One row per alternative closes that.
- **A security default must not change as a side effect of another setting.** Turning the gate off with the design scope surprised users who had set the scope for routing only; the lead kept the gate on in every scope.
- **Linux green is not macOS green for a regex.** macOS's libc regex allows at most 255 in `{n}` (`RE_DUP_MAX`); `{401}` failed to compile there and silently never matched. bash 3.2 also rewrites strings slowly, so size limits go before any `${x//a/b}` decoding. Keep every bound at 255 or less, and read the macOS job before calling a hook change done.
