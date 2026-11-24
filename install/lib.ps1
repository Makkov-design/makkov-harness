# Shared by install.ps1 and uninstall.ps1. Dot-sourced, not run. Windows PowerShell 5.1 and PowerShell 7.
# install/lib.sh is the bash twin: keep the two in step, rule for rule. Every path goes through -LiteralPath,
# so a folder name with [ or ] is not read as a wildcard.
#
# Files are read and written as bytes. Text is handled as Latin-1 (code page 28591), which maps every byte to
# one character and back unchanged, so a file in any 8-bit encoding (UTF-8, with or without a BOM, Windows-1251,
# Windows-1252...) keeps its bytes; the routing block is inserted as its UTF-8 bytes, as the bash twin does.

$MhStart = '<!-- makkov-harness:start -->'
$MhEnd = '<!-- makkov-harness:end -->'
$MhPStart = '<!-- makkov-harness:personal:start -->'
$MhPEnd = '<!-- makkov-harness:personal:end -->'
$MhUtf8 = New-Object System.Text.UTF8Encoding $false
$MhRaw = [Text.Encoding]::GetEncoding(28591)
# Two jobs, two rules for \. RESOLVING a real path on disk (Get-MhReal, Test-MhRealUnder) splits on the system's own
# separators: on Windows \ and /, on macOS and Linux / only, where \ is an ordinary character in a name (a folder may
# be called a\b). VALIDATING untrusted text (manifest lines, anything under .makkov-harness) stays strict on every
# OS: Test-MhDotDot, Test-MhUnder, Test-MhSamePath, Test-MhEndsWith, Get-MhRebased, Get-MhRel and Test-MhInside read \
# as a separator everywhere, and on macOS and Linux a manifest path with a \ in it is refused outright, since
# PowerShell's file cmdlets may still read it as one.
$MhWin = [IO.Path]::DirectorySeparatorChar -eq '\'
$MhSplit = if ($MhWin) { '[\\/]' } else { '/' }
function ConvertTo-MhSlash([string]$P) { if ($MhWin) { $P -replace '\\', '/' } else { $P } }

# A fingerprint of a folder: every file's relative path and SHA-256, in ordinal order (the same in every
# culture and in both PowerShell versions). Get-MhTreeIds also gives the id of the culture-sorted fingerprint
# that installs up to this version recorded (the same id whenever no two file names sort differently).
function Get-MhId([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}
# The files are listed with .NET, which writes every path as the folder's path exactly as given plus the rest, so
# cutting the folder off is exact (Get-ChildItem's FullName can spell a short 8.3 name such as RUNNER~1 out in full,
# and the cut then fell in the wrong place).
function Get-MhTreeIds([string]$Dir) {
  $root = (Resolve-Path -LiteralPath $Dir).ProviderPath.TrimEnd([IO.Path]::DirectorySeparatorChar)
  $paths = [string[]][IO.Directory]::GetFiles($root, '*', [IO.SearchOption]::AllDirectories)
  # SHA-256 with .NET, not Get-FileHash: Windows PowerShell 5.1 started from PowerShell 7 inherits a module path
  # where Get-FileHash cannot be loaded, and its error would leave the hash empty instead of stopping the run.
  $sha = [Security.Cryptography.SHA256]::Create()
  $hash = @{}; foreach ($f in $paths) { $hash[$f] = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($f))).Replace('-', '') }
  $ordinal = [string[]]$paths; [Array]::Sort($ordinal, [StringComparer]::Ordinal)
  $legacy = @($paths | Sort-Object)
  $line = { param($p) $p.Substring($root.Length) + ':' + $hash[$p] }
  @((Get-MhId (($ordinal | ForEach-Object { & $line $_ }) -join "`n")), (Get-MhId (($legacy | ForEach-Object { & $line $_ }) -join "`n"))) | Select-Object -Unique
}
# The id recorded in a new manifest.
function Get-MhTreeId([string]$Dir) { @(Get-MhTreeIds $Dir)[0] }

# A manifest's lines, always as an array (an empty file gives an empty one, not $null, which a pipeline would pass
# on as one item). Any line end is read (LF from install.sh, CRLF from this one; a byte order mark is skipped), and
# on Windows the paths install.sh writes from Git Bash (/c/x) or WSL (/mnt/c/x) are read as C:\x, so a manifest
# written by either installer is read by both.
function ConvertFrom-MhShellPath([string]$Value) {
  if ([IO.Path]::DirectorySeparatorChar -ne '\') { return $Value }
  if ($Value -cmatch '^/mnt/([a-zA-Z])(/.*)?$' -or $Value -cmatch '^/([a-zA-Z])(/.*)?$') {
    return $Matches[1].ToUpperInvariant() + ':' + $(if ($Matches[2]) { $Matches[2] -replace '/', '\' } else { '\' })
  }
  $Value
}
function Read-MhManifest([string]$Path) {
  ,@([IO.File]::ReadAllLines($Path, $MhUtf8) | ForEach-Object {
    if ($_ -cmatch '^(base|skills_dir|rules|rules_backup|backup)=(.*)$') { $Matches[1] + '=' + (ConvertFrom-MhShellPath $Matches[2]) } else { $_ }
  })
}

# Deletes a skill folder the harness put there: renamed first to a temporary name (.mh-tmp-old-<name>, which
# install and uninstall clear), so an interrupted delete never leaves a half-deleted folder under the skill's name.
function Remove-MhSkill([string]$Dir) {
  $t = Join-Path (Split-Path -Parent $Dir) ('.mh-tmp-old-' + (Split-Path -Leaf $Dir))
  Remove-MhTree $t
  Move-Item -LiteralPath $Dir -Destination $t; Remove-MhTree $t
}
# Removes a file or a folder. A symlink or junction is removed as a link: Windows PowerShell 5.1's
# Remove-Item -Recurse on a junction deletes the files of the folder it points to.
function Remove-MhTree([string]$Path) {
  if (Test-MhLink $Path) {
    # A folder link is removed as a folder entry, a dangling one too (its attributes still say Directory).
    if ([IO.File]::GetAttributes($Path) -band [IO.FileAttributes]::Directory) { [IO.Directory]::Delete($Path, $false) } else { [IO.File]::Delete($Path) }
  } elseif (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
}
# Moves a folder between the skills folder and .makkov-harness\backups. Move-Item where it can; where the two are on
# different volumes (Windows PowerShell 5.1 refuses to move a folder across volumes), a copy under a temporary name
# next to the destination (.mh-tmp-move-<name>, which install and uninstall clear), checked to hold the same files,
# renamed into place, and only then the source removed: an interruption leaves the source, or both, never neither.
function Move-MhDir([string]$From, [string]$To) {
  try { Move-Item -LiteralPath $From -Destination $To -ErrorAction Stop; return }
  catch { if (-not (Test-Path -LiteralPath $From) -or (Test-Path -LiteralPath $To)) { throw } }
  $t = Join-Path (Split-Path -Parent $To) ('.mh-tmp-move-' + (Split-Path -Leaf $To))
  Remove-MhTree $t
  Copy-Item -LiteralPath $From -Destination $t -Recurse
  if ((Get-MhTreeId $From) -ne (Get-MhTreeId $t)) { Remove-MhTree $t; throw "$From could not be copied to $To whole. Nothing of it was removed; run this again." }
  Move-Item -LiteralPath $t -Destination $To
  Remove-MhTree $From
}

# One run at a time in a folder. The lock is the same in install.sh, install.ps1 and the Node installer, and each
# clause has a scenario in install/test/:
#  1. Take: a run holds the lock once it has made .makkov-harness\lock\owner itself, with CreateNew (O_EXCL). The
#     folders on the way are made with CreateDirectory, which alone is not exclusive on every file system.
#  2. Refuse: a run that finds an owner file it does not judge stale stops before any change and removes nothing.
#  3. Take over: an owner file is stale when its process is gone on this computer, or it is more than a day old. A run
#     removes one only while it holds .makkov-harness\lock.takeover (made with CreateNew), after judging it again.
#  4. Release: a run removes the owner file only while it is still its own (the same pid, host and start), then the
#     lock folder if it is empty, then the harness folder only if it is empty and this run made it, or this run is
#     an uninstall that has just removed the last thing the harness kept there ($mhLock.DropState).
#  5. Nothing installed: an uninstall that finds no manifest and a harness folder holding only a lock and manifests
#     being written (install-*.txt.new) takes that lock as in 1 or 3 (never a live one), removes those, and by 4 the
#     folder (Clear-MhLockOnly): a first install killed after it took the lock and before its first change leaves that.
# The computer's name is the one Node and bash use (the DNS host name, not the 15-character NetBIOS name).
function Get-MhHost { try { [Net.Dns]::GetHostName() } catch { [Environment]::MachineName } }
function Get-MhLockOwner([string]$Lock) {
  $t = ''; try { $t = [IO.File]::ReadAllText((Join-Path $Lock 'owner')) } catch { }
  $get = { param($k) if ($t -match "(?m)^$k=(.*)$") { $Matches[1].Trim() } else { '' } }
  $ownerPid = 0; [void][int]::TryParse((& $get 'pid'), [ref]$ownerPid)
  $started = 0L; [void][long]::TryParse((& $get 'started'), [ref]$started)
  $host_ = & $get 'host'
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  # With no start time (no owner file yet, or one with nothing in it): the age of the owner file, else the folder.
  $ownerAt = Join-Path $Lock 'owner'
  $age = if ($started -gt 0) { $now - $started } elseif (Test-Path -LiteralPath $ownerAt) { try { ([DateTime]::UtcNow - [IO.File]::GetLastWriteTimeUtc($ownerAt)).TotalSeconds } catch { 0 } } else { try { ([DateTime]::UtcNow - [IO.Directory]::GetLastWriteTimeUtc($Lock)).TotalSeconds } catch { 0 } }
  $stale = $age -gt 86400
  if (-not $t) { $stale = $stale -or $age -gt 60 }   # no owner after a minute: a run stopped while making the lock
  elseif (-not $host_ -or [string]::Equals($host_, (Get-MhHost), [StringComparison]::OrdinalIgnoreCase)) {
    if ($ownerPid -gt 0 -and -not (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) { $stale = $true }
  }
  @{ Pid = $ownerPid; Stale = $stale }
}
# Clause 3: removes a lock judged stale, holding lock.takeover while it looks again; without it, a run that judged the
# lock of a run that just finished could remove the lock a third run has just made, and two runs would go on at once.
function Enter-MhTakeover([string]$Lock) {
  $t = "$Lock.takeover"
  $f = $null
  try { $f = [IO.File]::Open($t, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write) } catch {
    # One left by a run stopped while taking over (it holds it for a moment only): its process gone on this
    # computer, or a minute old.
    try {
      $x = [IO.File]::ReadAllText($t); $tp = 0
      if ($x -match '(?m)^pid=(\d+)') { [void][int]::TryParse($Matches[1], [ref]$tp) }
      $th = if ($x -match '(?m)^host=(.*)$') { $Matches[1].Trim() } else { '' }
      $gone = $tp -gt 0 -and [string]::Equals($th, (Get-MhHost), [StringComparison]::OrdinalIgnoreCase) -and -not (Get-Process -Id $tp -ErrorAction SilentlyContinue)
      if ($gone -or ([DateTime]::UtcNow - [IO.File]::GetLastWriteTimeUtc($t)).TotalSeconds -gt 60) { [IO.File]::Delete($t) }
    } catch { }
    return $false
  }
  try { $b = $MhUtf8.GetBytes("pid=$PID`nhost=$(Get-MhHost)`n"); $f.Write($b, 0, $b.Length) } finally { $f.Dispose() }
  try {
    $o = Get-MhLockOwner $Lock
    if ($o.Stale) {
      [Console]::Error.WriteLine("Taking over the lock a stopped run left ($(if ($o.Pid) { 'process ' + $o.Pid } else { 'no owner' })).")
      try { [IO.File]::Delete((Join-Path $Lock 'owner')); [IO.Directory]::Delete($Lock) } catch { }
    }
  } finally { try { [IO.File]::Delete($t) } catch { } }
  $true
}
# Clauses 1 to 3. Returns what Exit-MhLock needs; $null when the folder cannot be written (the checks before the first
# change then say why). When another run holds the lock it stops the run, or with -Quiet returns 'held'.
function Enter-MhLock([string]$State, [string]$Base, [switch]$Quiet) {
  $l = Join-Path $State 'lock'
  $made = $false
  for ($i = 0; $i -lt 6; $i++) {
    if (Test-MhLink $State) { if ($Quiet) { return 'held' }; [Console]::Error.WriteLine("$State is a link, not the harness's folder. Delete it, then run this again."); [Console]::Error.WriteLine('Nothing was changed.'); exit 1 }
    # The harness folder, made again if another run just took it away.
    if (-not [IO.Directory]::Exists($State)) {
      try { [void][IO.Directory]::CreateDirectory($State); $made = $true } catch { if (-not [IO.Directory]::Exists($State)) { return $null } }
    }
    if (Test-MhLink $l) { if ($Quiet) { return 'held' }; [Console]::Error.WriteLine("$l is a link, not the harness's lock folder. Delete it, then run this again."); [Console]::Error.WriteLine('Nothing was changed.'); exit 1 }
    try { [void][IO.Directory]::CreateDirectory($l) } catch [UnauthorizedAccessException] { return $null } catch { }
    # Gone between the two steps (the run that held it finished): try again, never go on without it.
    if (-not [IO.Directory]::Exists($l)) { continue }
    $me = "pid=$PID`nhost=$(Get-MhHost)`nstarted=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())`nby=install.ps1`n"
    $ownerFile = Join-Path $l 'owner'
    $f = $null
    try { $f = [IO.File]::Open($ownerFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write) }
    catch [UnauthorizedAccessException] {
      if (-not (Test-Path -LiteralPath $ownerFile)) { if ($Quiet) { return 'held' }; [Console]::Error.WriteLine("$l cannot be written, so the lock cannot be taken. Nothing was changed."); exit 1 }
    }
    catch { if (-not [IO.Directory]::Exists($l)) { continue } }
    if ($f) {
      try { $b = $MhUtf8.GetBytes($me); $f.Write($b, 0, $b.Length) } finally { $f.Dispose() }
      return @{ Lock = $l; State = $State; Me = $me; Made = $made; DropState = $false }
    }
    if (-not (Test-Path -LiteralPath $ownerFile)) { continue }
    $o = Get-MhLockOwner $l
    if ($o.Stale) { if (-not (Enter-MhTakeover $l)) { Start-Sleep -Seconds 1 }; continue }
    if ($Quiet) { return 'held' }
    [Console]::Error.WriteLine("Another makkov-harness run is working in $Base (process $(if ($o.Pid) { $o.Pid } else { '?' })). Let it finish, then run this again. If none is running, delete the folder $l and run this again.")
    [Console]::Error.WriteLine('Nothing was changed.')
    exit 1
  }
  if ($Quiet) { return 'held' }
  [Console]::Error.WriteLine("Could not take the lock $l. Delete that folder if no makkov-harness run is going on, then run this again.")
  [Console]::Error.WriteLine('Nothing was changed.')
  exit 1
}
# Clause 4.
function Exit-MhLock($Held) {
  if (-not $Held -or $Held -is [string]) { return }
  $ownerFile = Join-Path $Held.Lock 'owner'
  try { if ([IO.File]::ReadAllText($ownerFile) -ceq $Held.Me) { [IO.File]::Delete($ownerFile) } } catch { }
  try { [IO.Directory]::Delete($Held.Lock) } catch { }
  if ($Held.Made -or $Held.DropState) {
    try { if ([IO.Directory]::Exists($Held.State) -and @(Get-ChildItem -LiteralPath $Held.State -Force).Count -eq 0) { Remove-Item -LiteralPath $Held.State -Force } } catch { }
  }
}
# Clause 5, for an uninstall that found no manifest: a harness folder that holds only a lock (and the takeover file)
# and manifests being written is the leftover of a first install stopped before its first change.
function Clear-MhLockOnly([string]$State, [string]$Base) {
  $l = Join-Path $State 'lock'
  if ((Test-MhLink $State) -or -not [IO.Directory]::Exists($l) -or (Test-MhLink $l)) { return }
  if (@(Get-ChildItem -LiteralPath $State -Force | Where-Object { $_.Name -ne 'lock' -and $_.Name -ne 'lock.takeover' -and $_.Name -notlike 'install-*.txt.new' }).Count) { return }
  $h = Enter-MhLock $State $Base -Quiet
  if ($h -and $h -isnot [string]) {
    foreach ($t in @(Get-ChildItem -LiteralPath $State -Force -Filter 'install-*.txt.new' -File)) { Remove-Item -LiteralPath $t.FullName -Force }
    $h.DropState = $true; Exit-MhLock $h
  }
}

# The first value of key=... in a manifest's lines, as written.
function Get-MhRaw([string[]]$Lines, [string]$Key) {
  $l = @($Lines) | Where-Object { $_ -and $_.StartsWith("$Key=") } | Select-Object -First 1
  if ($null -eq $l) { '' } else { $l.Substring($Key.Length + 1) }
}

function Test-MhEndsWith([string]$Path, [string]$Tail) {
  $p = $Path -replace '\\', '/'
  $p.EndsWith($Tail, [StringComparison]::OrdinalIgnoreCase)
}

# The folder a manifest was written for. New manifests say it (base=); older ones are read back from the
# skills folder (<base>\.agents\skills or <base>\.cline\skills) or, for Aider, from <base>\CONVENTIONS.md.
function Get-MhOldBase([string[]]$Lines) {
  $b = Get-MhRaw $Lines 'base'
  if ($b) { return $b }
  $s = Get-MhRaw $Lines 'skills_dir'
  foreach ($t in '/.agents/skills', '/.cline/skills') { if ($s -and (Test-MhEndsWith $s $t)) { return $s.Substring(0, $s.Length - $t.Length) } }
  $r = Get-MhRaw $Lines 'rules'
  if ($r -and (Test-MhEndsWith $r '/CONVENTIONS.md')) { return $r.Substring(0, $r.Length - '/CONVENTIONS.md'.Length) }
  ''
}

# A path from a manifest, moved onto the current base when the home or project folder was moved or
# renamed since the install: <old base>\x becomes <base>\x. Paths outside the old base stay as written.
function Get-MhRebased([string]$Path, [string]$OldBase, [string]$Base) {
  if (-not $Path -or -not $OldBase -or $OldBase -eq $Base) { return $Path }
  if ($Path -eq $OldBase) { return $Base }
  foreach ($sep in '\', '/') {
    if ($Path.StartsWith($OldBase + $sep, [StringComparison]::OrdinalIgnoreCase)) { return $Base + $sep + $Path.Substring($OldBase.Length + 1) }
  }
  $Path
}

# A path-valued key of a manifest's lines, rebased.
function Get-MhPath([string[]]$Lines, [string]$Key, [string]$Base) { Get-MhRebased (Get-MhRaw $Lines $Key) (Get-MhOldBase $Lines) $Base }

# Two paths name the same file (Windows paths are not case-sensitive).
function Test-MhSamePath([string]$A, [string]$B) { [string]::Equals(($A -replace '\\', '/'), ($B -replace '\\', '/'), [StringComparison]::OrdinalIgnoreCase) }
# A path starts with a folder (as written, any separator, not case-sensitive).
function Test-MhUnder([string]$Path, [string]$Dir) {
  $p = $Path -replace '\\', '/'; $d = ($Dir -replace '\\', '/').TrimEnd('/') + '/'
  $p.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) -and $p.Length -gt $d.Length
}

# Where each agent's skills and instructions file go.
function Get-MhPaths([string]$Agent, [string]$Project, [string]$HomeDir) {
  $b = if ($Project) { $Project } else { $HomeDir }
  $skills = switch ($Agent) { 'cline' { Join-Path $b '.cline\skills' } 'aider' { '' } default { Join-Path $b '.agents\skills' } }
  $rules = switch ($Agent) {
    'codex'    { if ($Project) { Join-Path $Project 'AGENTS.md' } else { Join-Path $HomeDir '.codex\AGENTS.md' } }
    'gemini'   { if ($Project) { Join-Path $Project 'GEMINI.md' } else { Join-Path $HomeDir '.gemini\GEMINI.md' } }
    'opencode' { if ($Project) { Join-Path $Project 'AGENTS.md' } else { Join-Path $HomeDir '.config\opencode\AGENTS.md' } }
    'cline'    { if ($Project) { Join-Path $Project 'AGENTS.md' } else { Join-Path $HomeDir '.agents\AGENTS.md' } }
    'cursor'   { Join-Path $Project '.cursor\rules\makkov-harness.mdc' }
    'aider'    { Join-Path $Project 'CONVENTIONS.md' }
    default    { Join-Path $Project 'AGENTS.md' }
  }
  @{ Skills = $skills; Rules = $rules }
}

# A path with . or .. among its parts (never written by the installer).
function Test-MhDotDot([string]$Path) { @(($Path -replace '\\', '/') -split '/' | Where-Object { $_ -eq '.' -or $_ -eq '..' }).Count -gt 0 }
# A file system entry that is a symlink or a junction.
# (GetAttributes reads the link itself, not what it points to.)
function Test-MhLink([string]$Path) {
  try { [bool]([IO.File]::GetAttributes($Path) -band [IO.FileAttributes]::ReparsePoint) } catch { $false }
}
# A symlink whose target does not exist: opening it fails with "not found".
function Test-MhDangling([string]$Path) {
  if (-not (Test-MhLink $Path)) { return $false }
  try { [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite).Dispose(); $false }
  catch [IO.FileNotFoundException] { $true } catch [IO.DirectoryNotFoundException] { $true } catch { [IO.Directory]::Exists($Path) -eq $false -and -not [IO.File]::Exists((Resolve-MhLink $Path)) }
}
# A path lies inside the base: below it as written, with no .. and no symlink on the way (itself included).
function Test-MhInside([string]$Path, [string]$Base) {
  if (-not (Test-MhUnder $Path $Base) -or (Test-MhDotDot $Path)) { return $false }
  $d = $Base.TrimEnd('\', '/')
  foreach ($part in (($Path -replace '\\', '/').Substring(($Base -replace '\\', '/').TrimEnd('/').Length + 1) -split '/')) {
    if (-not $part) { continue }
    $d = Join-Path $d $part
    if (Test-MhLink $d) { return $false }
  }
  $true
}

# Untrusted input: everything under a project's .makkov-harness\ (manifests, backups, the copy in backups\original\,
# the lock) and its skills folder may have come with the repository, not from an install on this computer. So the
# installers act on a path there only when it lies inside the base with no link on the way (Test-MhCheckInside), make
# their copies with an exclusive create (never through a link), take a skill= entry only for a plain skill name whose
# folder holds a SKILL.md (Test-MhSkillFolder), and read every manifest as untrusted (Test-MhValidManifest).
# Returns why a path is reached through a link, or ''.
function Test-MhCheckInside([string]$Base, [string[]]$Paths) {
  foreach ($p in $Paths) {
    if ($p -and -not (Test-MhInside $p $Base)) { return "$p is a link or is reached through one (the harness and skills folders may have come with a repository, so the installer follows no links there). Replace the link with a folder of its own, then run this again" }
  }
  ''
}
# Where a path really is: every symlink or junction on its way followed, part by part, as the system resolves it
# ('' for a loop of links). On macOS and Linux a ".." after a link goes to the parent of where the link leads; Windows
# reads a link's relative target as text against the link's folder, ".." included, so there it is folded first.
function Get-MhReal([string]$Path) {
  # (.NET path calls only: Split-Path and Join-Path refuse an empty part, which a path's root gives on macOS and Linux;
  # and no GetFullPath, which would fold "link/.." away as text before the link is followed.)
  if (-not [IO.Path]::IsPathRooted($Path)) { $Path = [IO.Path]::Combine((Get-Location).ProviderPath, $Path) }
  $cur = [IO.Path]::GetPathRoot($Path)
  $todo = New-Object System.Collections.Generic.List[string]
  foreach ($x in @($Path.Substring($cur.Length) -split $MhSplit)) { if ($x) { $todo.Add($x) } }
  $links = 0
  while ($todo.Count) {
    $part = $todo[0]; $todo.RemoveAt(0)
    if ($part -eq '.') { continue }
    if ($part -eq '..') { $up = [IO.Path]::GetDirectoryName($cur); if ($up) { $cur = $up }; continue }
    $next = [IO.Path]::Combine($cur, $part)
    if (Test-MhLink $next) {
      # (Off Windows the target is read with .NET, not Get-Item: a cmdlet may read a \ in the name as a separator.)
      $t = if ($MhWin) { @((Get-Item -LiteralPath $next -Force).Target)[0] } else { (New-Object IO.FileInfo $next).LinkTarget }
      if ($t) {
        if (++$links -gt 40) { return '' }
        if (-not [IO.Path]::IsPathRooted($t) -and $MhWin) { $t = [IO.Path]::GetFullPath([IO.Path]::Combine($cur, $t)) }
        if ([IO.Path]::IsPathRooted($t)) { $cur = [IO.Path]::GetPathRoot($t); $t = $t.Substring($cur.Length) }
        $parts = @($t -split $MhSplit | Where-Object { $_ })
        $todo.InsertRange(0, [string[]]$parts)
        continue
      }
    }
    $cur = $next
  }
  $cur
}
# A real path (from Get-MhReal) is the base or below it, compared with the system's own separators: on macOS and Linux
# a \ is part of a name, so /p\x is not below /p.
function Test-MhRealUnder([string]$Path, [string]$Base) {
  $p = ConvertTo-MhSlash $Path; $b = (ConvertTo-MhSlash $Base).TrimEnd('/')
  $cmp = if ($MhWin) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
  [string]::Equals($p, $b, $cmp) -or $p.StartsWith($b + '/', $cmp)
}
# In a project, a link in the skills folder's path or the instructions file's path (the file itself included) may
# have come with the repository: one that leads outside the project, or an instructions file with more than one hard
# link (its other name can be anywhere), stops the run unless the person passed -FollowLinks. A user-level install
# keeps following the person's own links (dotfiles). Returns why, or ''.
function Test-MhCheckLinks([string]$Project, [bool]$Follow, [string]$Skills, [string]$Rules) {
  if (-not $Project -or $Follow) { return '' }
  $rb = Get-MhReal $Project
  foreach ($p in @($Skills, $Rules)) {
    if (-not $p) { continue }
    $r = Get-MhReal $p
    if (-not $r -or -not (Test-MhRealUnder $r $rb)) {
      return "$p leads outside the project through a link (to $(if ($r) { $r } else { 'a loop of links' })). A link in a project may have come with the repository, so the installer does not follow it. If you made the link yourself, run this again with -FollowLinks"
    }
  }
  $r = Get-MhReal $Rules
  if ($r -and [IO.File]::Exists($r) -and (Get-Item -LiteralPath $r -Force -ErrorAction SilentlyContinue).LinkType -eq 'HardLink') {
    return "$Rules has more than one hard link, so the same file may also be somewhere outside the project. If you made the link yourself, run this again with -FollowLinks"
  }
  ''
}
# A folder named by a skill= entry is one the installer may remove or move: a plain skill name and a SKILL.md in it.
function Test-MhSkillFolder([string]$Name, [string]$Dir) { ($Name -cmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') -and [IO.File]::Exists((Join-Path $Dir 'SKILL.md')) }
# The fingerprints of a folder with no regular file in it (install.ps1's, install.sh's): any such folder has them, so
# they never show that a folder is the harness's.
$MhEmptyIds = @('e3b0c44298fc1c14', '4294967295')

# A manifest is input the installer does not trust: someone may have edited it, or it came with a cloned
# repository. It is used only when it names exactly the paths the installer itself would use for that agent
# in this folder, its backups lie in .makkov-harness\backups\ and its skill names are plain folder names.
# Returns why not, or '' when it is fine.
function Test-MhValidManifest([string]$Path, [string]$Base, [string]$Project, [string]$HomeDir) {
  $lines = Read-MhManifest $Path
  # On macOS and Linux no path the installer writes holds a \ (a manifest install.ps1 wrote on Windows is refused here).
  if (-not $MhWin -and @($lines | Where-Object { $_ -cmatch '^(base|skills_dir|rules|rules_backup|backup|created_dir)=.*\\' }).Count) { return 'a path with a backslash' }
  $st = Join-Path $Base '.makkov-harness'
  $a = Get-MhRaw $lines 'agent'
  if (@('codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider') -notcontains $a) { return 'it names no agent' }
  if ((Split-Path -Leaf $Path) -ne "install-$a.txt") { return "it is for $a, not for its file name" }
  if (-not (Get-MhRaw $lines 'rules')) { return 'it names no instructions file' }
  $p = Get-MhPaths $a $Project $HomeDir
  if (-not (Test-MhSamePath (Get-MhPath $lines 'rules' $Base) $p.Rules)) { return "its instructions file is not the one $a uses here" }
  if (-not (Test-MhSamePath (Get-MhPath $lines 'skills_dir' $Base) $p.Skills)) { return "its skills folder is not the one $a uses here" }
  $ob = Get-MhOldBase $lines
  $v = Get-MhPath $lines 'rules_backup' $Base
  if ($v) {
    $orig = Join-Path (Join-Path $st 'backups') 'original'
    if (Test-MhUnder $v $orig) {
      if (-not (Test-MhInside $v $Base)) { return 'its copy of the instructions file is outside the harness folder' }
    } elseif ((Test-MhUnder $v (Split-Path -Parent $p.Rules)) -and (Split-Path -Leaf $v).StartsWith((Split-Path -Leaf $p.Rules) + '.bak-', [StringComparison]::OrdinalIgnoreCase) -and
              (Test-MhSamePath (Split-Path -Parent $v) (Split-Path -Parent $p.Rules))) {
    } else { return 'its copy of the instructions file is not one the installer makes' }
  }
  foreach ($l in ($lines | Where-Object { $_.StartsWith('backup=') })) {
    $v = Get-MhRebased $l.Substring(7) $ob $Base
    if (-not (Test-MhUnder $v (Join-Path $st 'backups'))) { return 'a backup folder outside .makkov-harness\backups' }
    if (-not (Test-MhInside $v $Base)) { return "a backup folder outside $Base" }
  }
  foreach ($l in ($lines | Where-Object { $_.StartsWith('skill=') })) {
    $e = $l.Substring(6)
    if ($e -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]*( [0-9a-f]+)?$') { return 'a skill entry that is not a plain folder name' }
  }
  foreach ($l in ($lines | Where-Object { $_.StartsWith('created_dir=') })) {
    $rel = $l.Substring(12)
    if (-not $rel) { continue }
    if ([IO.Path]::IsPathRooted($rel) -or $rel.StartsWith('/') -or $rel.StartsWith('\')) { return 'a created folder given as an absolute path' }
    if (Test-MhDotDot $rel) { return 'a created folder with .. in its path' }
    # A folder on the way to any agent's skills or instructions folder here: an uninstall hands a folder still in
    # use on to the other installs in the folder, whichever agent created it.
    $v = Join-Path $Base $rel; $ok = $false
    foreach ($x in 'codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider') {
      if (-not $Project -and @('cursor', 'copilot', 'windsurf', 'aider') -contains $x) { continue }
      $q = Get-MhPaths $x $Project $HomeDir
      if (($q.Skills -and ((Test-MhSamePath $q.Skills $v) -or (Test-MhUnder $q.Skills $v))) -or
          (Test-MhSamePath (Split-Path -Parent $q.Rules) $v) -or (Test-MhUnder (Split-Path -Parent $q.Rules) $v)) { $ok = $true }
    }
    if (-not $ok) { return 'a created folder the installer would not create' }
  }
  ''
}

# The file a path finally names: every link on the way followed as the system resolves it (Get-MhReal, so a ".."
# after a link goes where the system takes it), so writes go to the real file and the link itself is left as it is.
function Resolve-MhLink([string]$Path) {
  if (-not (Test-MhLink $Path)) { return $Path }
  $r = Get-MhReal $Path
  if ($r) { $r } else { $Path }
}

# Checks that a file can be changed in place: absent (with a folder it can be created in), or a regular file,
# or a symlink to one, that is not read-only. Returns why not, or ''.
function Test-MhWritableFile([string]$File) {
  if (Test-MhDangling $File) { return "$File is a symlink to $(Resolve-MhLink $File), which does not exist" }
  if ([IO.Directory]::Exists($File)) { return "$File is not a regular file" }
  if ([IO.File]::Exists($File)) {
    if ((New-Object IO.FileInfo (Resolve-MhLink $File)).IsReadOnly) { return "$File is read-only" }
    return ''
  }
  Test-MhWritableDir (Split-Path -Parent $File)
}
# Checks that a folder exists, or can be created (no file in the way).
function Test-MhWritableDir([string]$Dir) {
  $d = $Dir
  while ($d -and -not [IO.Directory]::Exists($d)) {
    if ([IO.File]::Exists($d)) { return "$d is not a folder" }
    $d = Split-Path -Parent $d
  }
  ''
}

# Reads and writes a file's bytes, through a symlink, to the end of the stream (not to the length the file
# system reports, which for a link can be the link's own, 0).
function Read-MhBytes([string]$File) {
  $in = [IO.File]::Open($File, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try { $ms = New-Object IO.MemoryStream; $in.CopyTo($ms); ,$ms.ToArray() } finally { $in.Dispose() }
}
# A regular file is replaced in one step: the new bytes go to <file>.mh-tmp, which then takes the file's place
# (File.Replace keeps its attributes), so an interruption leaves the old file or the new one, never half of one
# (install and uninstall clear a .mh-tmp left behind). A symlink is written through in place, so it stays one.
function Write-MhInPlace([string]$File, [byte[]]$Bytes) {
  $out = [IO.File]::Open((Resolve-MhLink $File), [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $out.Write($Bytes, 0, $Bytes.Length) } finally { $out.Dispose() }
}
function Write-MhBytes([string]$File, [byte[]]$Bytes) {
  # A file with more than one hard link is written in place too, so every name keeps the same file.
  if ((Test-MhLink $File) -or ([IO.File]::Exists($File) -and (Get-Item -LiteralPath $File -Force).LinkType -eq 'HardLink')) { Write-MhInPlace $File $Bytes; return }
  $t = "$File.mh-tmp"
  Write-MhInPlace $t $Bytes
  if (-not [IO.File]::Exists($File)) { [IO.File]::Move($t, $File); return }
  try { [IO.File]::Replace($t, $File, [NullString]::Value) }
  catch { Write-MhInPlace $File $Bytes; Remove-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue }   # a file system without File.Replace
}
function Copy-MhBytes([string]$From, [string]$To) { Write-MhBytes $To (Read-MhBytes $From) }
# A new copy of a file: written to <to>.mh-tmp with an exclusive create (never through a link) and renamed into place.
function New-MhCopy([string]$From, [string]$To) {
  $t = "$To.mh-tmp"; if ((Test-MhLink $t) -or [IO.File]::Exists($t)) { [IO.File]::Delete($t) }
  $b = Read-MhBytes $From
  $out = [IO.File]::Open($t, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $out.Write($b, 0, $b.Length) } finally { $out.Dispose() }
  [IO.File]::Move($t, $To)
}
# Two files hold the same bytes.
function Test-MhSameBytes([string]$A, [string]$B) {
  $x = Read-MhBytes $A; $y = Read-MhBytes $B
  if ($x.Length -ne $y.Length) { return $false }
  for ($i = 0; $i -lt $x.Length; $i++) { if ($x[$i] -ne $y[$i]) { return $false } }
  $true
}
# A file as text, one character per byte; and text written back the same way.
function Read-MhText([string]$File) { $MhRaw.GetString((Read-MhBytes $File)) }
function Write-MhText([string]$File, [string]$Text) { Write-MhBytes $File $MhRaw.GetBytes($Text) }
# UTF-8 text (the routing block) as the characters Read-MhText would give for its bytes.
function ConvertTo-MhRaw([string]$Text) { $MhRaw.GetString([Text.Encoding]::UTF8.GetBytes($Text)) }

# A file in UTF-16 or UTF-32 (a byte order mark says so): the harness would corrupt it, so it stops instead.
function Test-MhWideText([string]$File) {
  if (-not [IO.File]::Exists($File)) { return $false }
  $b = Read-MhBytes $File
  ($b.Length -ge 2 -and (($b[0] -eq 0xFF -and $b[1] -eq 0xFE) -or ($b[0] -eq 0xFE -and $b[1] -eq 0xFF))) -or
  ($b.Length -ge 4 -and $b[0] -eq 0 -and $b[1] -eq 0 -and $b[2] -eq 0xFE -and $b[3] -eq 0xFF)
}

# The file after the harness's blocks are taken out is the file as it was: the same bytes, or the same plus the
# one newline the installer added to a file that did not end in one. Any other difference is an edit of yours.
function Test-MhSameText([string]$A, [string]$B) {
  $ta = Read-MhText $A; $tb = Read-MhText $B
  ($ta -ceq $tb) -or ($tb.Length -gt 0 -and -not $tb.EndsWith("`n") -and $ta -ceq ($tb + "`n"))
}

# A file's lines without their line ends ("`r" of a CRLF file stays on the line, as in awk).
function Get-MhLines([string]$File) {
  $t = Read-MhText $File
  if ($t.Length -eq 0) { return ,@() }
  $l = $t -split "`n"
  if ($t.EndsWith("`n")) { $l = $l[0..($l.Count - 2)] }
  ,@($l)
}
function Join-MhLines([string[]]$Lines) { if ($Lines.Count) { ($Lines -join "`n") + "`n" } else { '' } }

# Checks the marked blocks before anything is rewritten: every start marker has its end marker after it, no
# block opens inside another, and there is at most one routing block. Returns what is wrong, or '' if nothing.
function Test-MhMarkers([string]$File) {
  if (-not [IO.File]::Exists($File)) { return '' }
  $open = ''; $at = 0; $mains = 0; $n = 0
  foreach ($line in (Get-MhLines $File)) {
    $n++
    if ($line.Contains($MhStart)) {
      if ($open) { return "line ${n}: a routing block starts inside another marked block" }
      $open = 'main'; $at = $n; $mains++
      if ($mains -gt 1) { return "line ${n}: a second routing block" }
    } elseif ($line.Contains($MhPStart)) {
      if ($open) { return "line ${n}: a personal layer starts inside another marked block" }
      $open = 'personal'; $at = $n
    } elseif ($line.Contains($MhEnd)) {
      if ($open -ne 'main') { return "line ${n}: an end marker with no routing block open" }
      $open = ''
    } elseif ($line.Contains($MhPEnd)) {
      if ($open -ne 'personal') { return "line ${n}: a personal end marker with no personal layer open" }
      $open = ''
    }
  }
  if ($open -eq 'main') { return "line ${at}: a routing block with no end marker" }
  if ($open -eq 'personal') { return "line ${at}: a personal layer with no end marker" }
  ''
}
function Stop-MhMarkers([string]$File, [string]$Why) {
  [Console]::Error.WriteLine("${File}: the makkov-harness markers are not paired ($Why).")
  [Console]::Error.WriteLine('Nothing was changed. Fix or delete the marked lines by hand, then run this again.')
}

# The file with the routing block replaced by $Block (as Read-MhText characters). Lines outside the block
# are kept as they are.
function Get-MhReplacedBlock([string]$File, [string]$Block) {
  $out = New-Object System.Collections.Generic.List[string]; $skip = $false
  foreach ($line in (Get-MhLines $File)) {
    if ($line.Contains($MhStart)) { $out.Add($Block); $skip = $true; continue }
    if ($line.Contains($MhEnd)) { $skip = $false; continue }
    if (-not $skip) { $out.Add($line) }
  }
  Join-MhLines $out.ToArray()
}

# The file with the routing block and the personal layer taken out, each with the one blank line before it that
# the installer (or harness-onboarding) put there when it appended the block. Every other line stays as it is.
function Get-MhRemovedBlocks([string]$File) {
  $out = New-Object System.Collections.Generic.List[string]; $skip = $false
  foreach ($line in (Get-MhLines $File)) {
    if ($line.Contains($MhStart) -or $line.Contains($MhPStart)) {
      if ($out.Count -gt 0 -and $out[$out.Count - 1] -match '^[ \t\r]*$') { $out.RemoveAt($out.Count - 1) }
      $skip = $true; continue
    }
    if ($line.Contains($MhEnd) -or $line.Contains($MhPEnd)) { $skip = $false; continue }
    if (-not $skip) { $out.Add($line) }
  }
  Join-MhLines $out.ToArray()
}

# The personal layer of a file, markers included ('' when there is none).
function Get-MhPersonalLayer([string]$File) {
  $out = New-Object System.Collections.Generic.List[string]; $on = $false
  foreach ($line in (Get-MhLines $File)) {
    if ($line.Contains($MhPStart)) { $on = $true }
    if ($on) { $out.Add($line) }
    if ($line.Contains($MhPEnd)) { $on = $false }
  }
  Join-MhLines $out.ToArray()
}

# A path relative to the base, for created_dir= lines (always with / separators).
function Get-MhRel([string]$Path, [string]$Base) {
  foreach ($sep in '\', '/') {
    if ($Path.StartsWith($Base + $sep, [StringComparison]::OrdinalIgnoreCase)) { return ($Path.Substring($Base.Length + 1) -replace '\\', '/') }
  }
  $Path
}

# The folders between the base and a folder that do not exist yet, deepest first, relative to the base.
function Get-MhMissingDirs([string]$Dir, [string]$Base) {
  $d = $Dir
  while ($d -and -not (Test-MhSamePath $d $Base) -and -not (Test-Path -LiteralPath $d)) {
    if ((Get-MhRel $d $Base) -eq $d) { return }
    Get-MhRel $d $Base
    $d = Split-Path -Parent $d
  }
}
