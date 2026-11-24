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
- **Count the work, not only the size.** bash 3.2 rewrites each match of `${x//a/b}` slowly, so 9,900 escaped quotes in 20 KB took over 4.5 s on macOS while Linux took 20 ms. A limit on the number of escapes (counted with one bounded regex) is what keeps the decode step fast there.

## 2026-11-23 · Install gate audit, round 2

- **Quotes are not the only thing that changes what a quote means.** The text rule tracked quoting but not `#` comments and heredoc bodies, where a `'` is plain text; a stray quote there paired with a later one and hid the command between. A pass rule must give up (ask) whenever the command has a construct it does not model, rather than model it halfway.
- **A typed separator can look like a decoded one.** The decoded command turns a line break into ` ; `, so a typed ` ; ` after a heredoc delimiter passed for a real line break. Check structure on the text as sent, where the two differ.
- **A bound added for speed needs a fallback for what falls outside it.** Capping spans and windows in the scanner let a `curl … | sh` padded past the cap through. One cheap, unbounded-but-linear check per line (has `curl`, later has `| sh`) restores what the bounded rule cannot see.
- **"Better than before" needs a test, not a reading.** A differential test now runs the released gate and scanner rule next to the new ones over the corpus; anything the old one caught and the new one lets through fails, unless it is on a short, reviewed list with a reason each.
- **Cover both spellings of a form.** `curl -o file` asked but `curl … > file` did not; `?a=1&b=2` in quotes asked but `\&` did not. When a pattern is added, add its twin in the same commit.

## 2026-11-24 · Install gate audit, round 3

- **When a pass rule needs a third patch, shrink it instead.** The "text is only text" rule was patched for `#` comments and heredoc bodies, and the next audit still found three more places where a quote is not a quote: a heredoc body line ending in `\` or `|` (joined with the closing line, so the gate missed where the heredoc ended), `$'…\'…'`, and the PowerShell tool, where a backslash does not escape a quote. The rule now covers only what can be checked by reading: the Bash tool, a single-quoted value or a double-quoted one with no `$`, backtick or backslash, and nothing else in the command that changes what a quote means. The heredoc exception is gone; a heredoc message with install words asks.
- **One grammar per shell.** A hook that runs for two tools must know which one it is reading before it trusts a quote.
