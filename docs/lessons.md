# Engineering lessons

Short records of what a change taught, so the next change does not relearn it. Newest first.

## Installers: update and uninstall (installer fixes after 0.5.0)

- **A file can belong to more than one install.** Codex, Copilot, Windsurf, Cline and OpenCode all write
  `<project>/AGENTS.md`; Codex and Cline in the home folder share `~/.agents`. Every "is this still in use?"
  check has to cover every shared resource (skills, the instructions file, folders), not only the first one
  that came to mind. The uninstaller now asks the other manifests about all three.
- **Write through, do not replace.** `mktemp` + `mv` turns a symlink into a regular file and gives it the
  temp file's mode (600). Rewrite the existing file in place (`cat tmp > file`), and skip the write when the
  content is already current, so a second run really changes nothing.
- **Validate before the first write.** An unpaired marker made one installer truncate the file and the other
  append a second block. Parsing the file first and stopping with the line number, before any skill is
  copied, keeps a failed run from leaving half an install.
- **Do not store only absolute paths.** A moved project made the uninstaller "succeed" while finding nothing.
  The manifest now records the folder it was written for (`base=`); older manifests are rebased by reading the
  base back from their own skills path. When a path from a manifest does not exist, that is a signal, not a
  reason to report success.
- **Every flag a user can give once must survive an update.** `--scope design` was stored and never read.
  When the installer writes a setting to the manifest, the next run defaults to it.
- **Removal must be exact, not just "close".** Appending added a blank line the uninstall never took away.
  Keep one copy of the user's file as it was, and when the result matches it apart from trailing newlines,
  put the copy back byte for byte.
- **Two implementations drift unless the tests pin behaviour.** The bash and PowerShell installers had
  different append and marker rules. Each behaviour is now one named scenario in both test files, and the
  shared logic sits in `lib.sh` / `lib.ps1`, side by side.
- **Test the fix against the old code.** Running the new scenarios against the scripts on `main` gave 64
  failures before the fix and none after, which shows the tests catch the bugs they name.
- **A safety hook blocks `rm -rf "$HOME"`** even when HOME points at a temp folder. In ad hoc checks, keep the
  temp folder in its own variable and never remove through `$HOME`.
