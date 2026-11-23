# Shared by install.ps1 and uninstall.ps1. Dot-sourced, not run. Windows PowerShell 5.1 and PowerShell 7.
# install/lib.sh is the bash twin: keep the two in step, rule for rule. Every path goes through -LiteralPath,
# so a folder name with [ or ] is not read as a wildcard.

$MhStart = '<!-- makkov-harness:start -->'
$MhEnd = '<!-- makkov-harness:end -->'
$MhPStart = '<!-- makkov-harness:personal:start -->'
$MhPEnd = '<!-- makkov-harness:personal:end -->'
$MhUtf8 = New-Object System.Text.UTF8Encoding $false

# A fingerprint of a folder: every file's relative path and SHA-256.
function Get-MhTreeFingerprint([string]$Dir) {
  $root = (Resolve-Path -LiteralPath $Dir).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
  (Get-ChildItem -LiteralPath $root -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
    $_.FullName.Substring($root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  }) -join "`n"
}

# A short id of a fingerprint, as recorded in the manifest.
function Get-MhTreeId([string]$Dir) {
  $bytes = [Text.Encoding]::UTF8.GetBytes((Get-MhTreeFingerprint $Dir))
  $sha = [Security.Cryptography.SHA256]::Create()
  (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}

function Read-MhManifest([string]$Path) { @([IO.File]::ReadAllLines($Path, $MhUtf8)) }

# The first value of key=... in a manifest's lines, as written.
function Get-MhRaw([string[]]$Lines, [string]$Key) {
  $l = $Lines | Where-Object { $_.StartsWith("$Key=") } | Select-Object -First 1
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

# A file's lines without their line ends ("`r" of a CRLF file stays on the line, as in awk).
function Get-MhLines([string]$File) {
  $t = [IO.File]::ReadAllText($File)
  if ($t.Length -eq 0) { return ,@() }
  $l = $t -split "`n"
  if ($t.EndsWith("`n")) { $l = $l[0..($l.Count - 2)] }
  ,@($l)
}
function Join-MhLines([string[]]$Lines) { if ($Lines.Count) { ($Lines -join "`n") + "`n" } else { '' } }

# Checks the marked blocks before anything is rewritten: every start marker has its end marker after it, no
# block opens inside another, and there is at most one routing block. Returns what is wrong, or '' if nothing.
function Test-MhMarkers([string]$File) {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return '' }
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

# The file with the routing block replaced by $Block. Lines outside the block are kept as they are.
function Get-MhReplacedBlock([string]$File, [string]$Block) {
  $out = New-Object System.Collections.Generic.List[string]; $skip = $false
  foreach ($line in (Get-MhLines $File)) {
    if ($line.Contains($MhStart)) { $out.Add($Block); $skip = $true; continue }
    if ($line.Contains($MhEnd)) { $skip = $false; continue }
    if (-not $skip) { $out.Add($line) }
  }
  Join-MhLines $out.ToArray()
}

# The file with the routing block and the personal layer taken out. When nothing but blank lines follows the
# last block taken out, the blank lines before it go too (the installer put one there when it appended).
function Get-MhRemovedBlocks([string]$File) {
  $out = New-Object System.Collections.Generic.List[string]; $skip = $false; $last = 0; $cut = $false
  foreach ($line in (Get-MhLines $File)) {
    if ($line.Contains($MhStart) -or $line.Contains($MhPStart)) { $skip = $true; continue }
    if ($line.Contains($MhEnd) -or $line.Contains($MhPEnd)) { $skip = $false; $last = $out.Count; $cut = $true; continue }
    if (-not $skip) { $out.Add($line) }
  }
  if ($cut) {
    $tail = $true
    for ($i = $last; $i -lt $out.Count; $i++) { if ($out[$i] -notmatch '^[ \t\r]*$') { $tail = $false } }
    if ($tail) { while ($out.Count -gt 0 -and $out[$out.Count - 1] -match '^[ \t\r]*$') { $out.RemoveAt($out.Count - 1) } }
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

# Copies a file's bytes into another file, in place: through a symlink at either end, and read to the end of
# the stream rather than to the length the file system reports (which can be the link's own, 0).
function Copy-MhBytes([string]$From, [string]$To) {
  $in = [IO.File]::Open($From, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $out = [IO.File]::Open($To, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $in.CopyTo($out) } finally { $out.Dispose() }
  } finally { $in.Dispose() }
}

# Writes text into a file in place (through a symlink, keeping the file's attributes), as UTF-8 without a BOM.
function Write-MhText([string]$File, [string]$Text) { [IO.File]::WriteAllText($File, $Text, $MhUtf8) }

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
