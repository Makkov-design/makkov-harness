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

# A fingerprint of a folder: every file's relative path and SHA-256, in ordinal order (the same in every
# culture and in both PowerShell versions). Get-MhTreeIds also gives the id of the culture-sorted fingerprint
# that installs up to this version recorded (the same id whenever no two file names sort differently).
function Get-MhId([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}
function Get-MhTreeIds([string]$Dir) {
  $root = (Resolve-Path -LiteralPath $Dir).ProviderPath.TrimEnd([IO.Path]::DirectorySeparatorChar)
  $files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force)
  $hash = @{}; foreach ($f in $files) { $hash[$f.FullName] = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash }
  $ordinal = [string[]]@($files | ForEach-Object { $_.FullName }); [Array]::Sort($ordinal, [StringComparer]::Ordinal)
  $legacy = @($files | Sort-Object FullName | ForEach-Object { $_.FullName })
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
    if ([IO.Directory]::Exists($Path)) { [IO.Directory]::Delete($Path, $false) } else { [IO.File]::Delete($Path) }
  } elseif (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
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

# A manifest is input the installer does not trust: someone may have edited it, or it came with a cloned
# repository. It is used only when it names exactly the paths the installer itself would use for that agent
# in this folder, its backups lie in .makkov-harness\backups\ and its skill names are plain folder names.
# Returns why not, or '' when it is fine.
function Test-MhValidManifest([string]$Path, [string]$Base, [string]$Project, [string]$HomeDir) {
  $lines = Read-MhManifest $Path
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
    if ($e -cnotmatch '^[A-Za-z0-9._-]+( [0-9a-f]+)?$' -or @('.', '..') -contains ($e -split ' ')[0]) { return 'a skill entry that is not a plain folder name' }
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

# The file a path finally names: a symlink is followed to its target (a relative target is read against the
# link's folder), so writes go to the real file and the link itself is left as it is.
function Resolve-MhLink([string]$Path) {
  $p = $Path
  for ($i = 0; $i -lt 16; $i++) {
    $item = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
    if (-not $item -or -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.LinkType -ne 'SymbolicLink') { return $p }
    $t = @($item.Target)[0]
    if (-not $t) { return $p }
    if (-not [IO.Path]::IsPathRooted($t)) { $t = Join-Path (Split-Path -Parent $p) $t }
    $p = $t
  }
  $p
}

# Checks that a file can be changed in place: absent (with a folder it can be created in), or a regular file,
# or a symlink to one, that is not read-only. Returns why not, or ''.
function Test-MhWritableFile([string]$File) {
  if (Test-MhDangling $File) { return "$File is a symlink to $(Resolve-MhLink $File), which does not exist" }
  if ([IO.Directory]::Exists($File)) { return "$File is not a regular file" }
  if ([IO.File]::Exists($File)) {
    if ((Get-Item -LiteralPath (Resolve-MhLink $File) -Force).IsReadOnly) { return "$File is read-only" }
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
