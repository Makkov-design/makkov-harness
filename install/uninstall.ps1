<#
  Removes what install.ps1 put in place for one agent, using the manifest it wrote
  (.makkov-harness\install-<agent>.txt in your home or project folder).
  - Skill folders: removed only if they are still identical to the copy the install put there; a folder you
    changed is moved to .makkov-harness\backups\<date>\removed\ instead. Folders another installed agent
    still uses from the same place are left alone.
  - Skills of yours that the install moved aside are put back.
  - The routing block, and the personal layer harness-onboarding wrote, are taken out of the instructions
    file, unless another installed agent still reads that file; a file you had before the install is put back
    byte for byte when you have not changed it since. A Cursor rule (and its personal rule) is deleted and
    your earlier rule, if there was one, is restored. A file the install created and that is now empty is
    deleted, and so are the folders the install created, once empty.
  - The manifest names absolute paths; if the home or project folder was moved or renamed since the install,
    they are read relative to the folder you pass now.

  Usage: uninstall.ps1 -Agent codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [-Project <path>] [-DryRun]
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider')]
  [string]$Agent,
  [string]$Project,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
$repo = Split-Path -Parent $PSScriptRoot
if ($Project) { $Project = (Resolve-Path -LiteralPath $Project).Path }
$base = if ($Project) { $Project } else { $env:USERPROFILE }
$state = Join-Path $base '.makkov-harness'
$manifest = Join-Path $state "install-$Agent.txt"
if (-not (Test-Path -LiteralPath $manifest)) {
  Write-Error ("No makkov-harness install for $Agent found in $base (no $manifest). " +
    'If you installed before 0.3.3, remove the skill folders and the marked block by hand; see INSTALL.md.')
}

$lines = Read-MhManifest $manifest
$ob = Get-MhOldBase $lines
$skillsDir = Get-MhPath $lines 'skills_dir' $base; $rules = Get-MhPath $lines 'rules' $base
$rulesExisted = Get-MhRaw $lines 'rules_existed'; $rulesBackup = Get-MhPath $lines 'rules_backup' $base
if ($ob -and $ob -ne $base) { Write-Output "Installed in $ob, which is now ${base}: reading the install from here." }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if ($DryRun) { Write-Output 'Dry run: nothing will be changed.' }

# Other installs in the same folder that read the same skills folder or the same instructions file.
function Get-Others { @(Get-ChildItem -LiteralPath $state -Filter 'install-*.txt' -File | Where-Object { -not (Test-MhSamePath $_.FullName $manifest) }) }
function Test-Shared([string]$Name) {
  foreach ($m in Get-Others) {
    $o = Read-MhManifest $m.FullName
    if ((Test-MhSamePath (Get-MhPath $o 'skills_dir' $base) $skillsDir) -and ($o | Where-Object { $_ -eq "skill=$Name" -or $_.StartsWith("skill=$Name ") })) { return $true }
  }
  return $false
}
$rulesUsers = @()
foreach ($m in Get-Others) {
  $o = Read-MhManifest $m.FullName
  if (Test-MhSamePath (Get-MhPath $o 'rules' $base) $rules) { $rulesUsers += (Get-MhRaw $o 'agent') }
}
# The file is rewritten only when its markers can be trusted; otherwise nothing is changed.
if ($Agent -ne 'cursor' -and -not $rulesUsers.Count) { $why = Test-MhMarkers $rules; if ($why) { Stop-MhMarkers $rules $why; exit 1 } }

# 1. Skills. A folder still matching the fingerprint the install recorded is ours and is removed; one that
# changed since is moved aside. Installs from before 0.5.0 recorded no fingerprint: compare with this copy.
if ($skillsDir) {
  foreach ($entry in @($lines | Where-Object { $_.StartsWith('skill=') } | ForEach-Object { $_.Substring(6) })) {
    $name, $id = $entry -split ' ', 2
    $dst = Join-Path $skillsDir $name
    if (-not (Test-Path -LiteralPath $dst)) { continue }
    if (Test-Shared $name) { Write-Output "  keep $dst (another installed agent uses it)"; continue }
    $ours = Join-Path (Join-Path $repo 'skills') $name
    if (($id -and (Get-MhTreeId $dst) -eq $id) -or
        (-not $id -and (Test-Path -LiteralPath $ours) -and ((Get-MhTreeFingerprint $ours) -eq (Get-MhTreeFingerprint $dst)))) {
      Write-Output "  remove $dst"; if (-not $DryRun) { Remove-Item -LiteralPath $dst -Recurse -Force }
    } else {
      $to = Join-Path (Join-Path (Join-Path (Join-Path $state 'backups') $stamp) 'removed') $name
      Write-Output "  move $dst to $to (you changed it)"
      if (-not $DryRun) { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $to) | Out-Null; Move-Item -LiteralPath $dst -Destination $to }
    }
  }
  # 2. Put back the skills the install moved aside. While another agent still uses this skills folder,
  #    hand the record of those backups on to its manifest, so its uninstall restores them.
  $myBackups = @($lines | Where-Object { $_.StartsWith('backup=') } | ForEach-Object { Get-MhRebased $_.Substring(7) $ob $base })
  foreach ($m in Get-Others) {
    $o = Read-MhManifest $m.FullName
    if (-not (Test-MhSamePath (Get-MhPath $o 'skills_dir' $base) $skillsDir)) { continue }
    foreach ($b in $myBackups) {
      if ($o -notcontains "backup=$b") {
        Write-Output "  hand the backup record on to $($m.Name)"
        if (-not $DryRun) { [IO.File]::AppendAllText($m.FullName, "backup=$b`n", $MhUtf8) }
      }
    }
  }
  foreach ($b in $myBackups) {
    if (-not (Test-Path -LiteralPath $b)) { continue }
    foreach ($d in @(Get-ChildItem -LiteralPath $b -Directory)) {
      $dst = Join-Path $skillsDir $d.Name
      if (Test-Path -LiteralPath $dst) { Write-Output "  leave your earlier $($d.Name) in $b ($dst exists)" }
      else { Write-Output "  restore your $($d.Name) to $dst"; if (-not $DryRun) { Move-Item -LiteralPath $d.FullName -Destination $dst } }
    }
  }
}

# 3. Routing, and the personal layer harness-onboarding wrote next to it.
$kept = Join-Path (Join-Path (Join-Path $state 'backups') $stamp) 'removed'
$personalRule = Join-Path (Split-Path -Parent $rules) 'makkov-harness-personal.mdc'
if ($Agent -eq 'cursor' -and (Test-Path -LiteralPath $personalRule)) {
  Write-Output "  delete $personalRule (a copy stays in $kept)"
  if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $kept | Out-Null; Move-Item -LiteralPath $personalRule -Destination (Join-Path $kept 'makkov-harness-personal.mdc') }
}
# The copy of the file from before the first install, if this uninstall is the one to use it (a copy an
# install from 0.5.0 or earlier left next to the file, *.bak-<date>, is used but left where it is).
$originals = Join-Path (Join-Path $state 'backups') 'original'
$oursBackup = $rulesBackup -and $rulesBackup.StartsWith($originals + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
if ($rulesUsers.Count) {
  Write-Output ("  keep the routing block in $rules (also installed there for: " + ($rulesUsers -join ', ') + ")")
} elseif (Test-Path -LiteralPath $rules -PathType Leaf) {
  if ($Agent -eq 'cursor') {
    Write-Output "  delete $rules"; if (-not $DryRun) { Remove-Item -LiteralPath $rules -Force }
    if ($rulesBackup -and (Test-Path -LiteralPath $rulesBackup)) {
      Write-Output "  restore your earlier rule from $rulesBackup"; if (-not $DryRun) { Copy-Item -LiteralPath $rulesBackup -Destination $rules }
    }
  } else {
    $old = [IO.File]::ReadAllText($rules)
    if ($old.Contains($MhStart) -or $old.Contains($MhPStart)) {
      Write-Output "  take the routing block and the personal layer out of $rules"
      if (-not $DryRun) {
        $layer = Get-MhPersonalLayer $rules
        if ($layer) {
          New-Item -ItemType Directory -Force -Path $kept | Out-Null; Write-MhText (Join-Path $kept 'personal-layer.md') $layer
          Write-Output "  your personal layer is kept in $(Join-Path $kept 'personal-layer.md')"
        }
        $new = Get-MhRemovedBlocks $rules
        # Unchanged since the install apart from the harness's blocks: put back byte for byte.
        $exact = $rulesBackup -and (Test-Path -LiteralPath $rulesBackup -PathType Leaf) -and ($new.TrimEnd("`n") -ceq [IO.File]::ReadAllText($rulesBackup).TrimEnd("`n"))
        if ($rulesExisted -ne '1' -and -not $new.Trim()) {
          Remove-Item -LiteralPath $rules -Force
          Write-Output "  delete $rules (the install created it and it is now empty)"
        } elseif ($exact) { Copy-MhBytes $rulesBackup $rules }
        else { Write-MhText $rules $new }
      }
    }
  }
}
if (-not $rulesUsers.Count -and $oursBackup -and (Test-Path -LiteralPath $rulesBackup)) { if (-not $DryRun) { Remove-Item -LiteralPath $rulesBackup -Force } }

# 4. The manifest, then the folders the install created, once empty (deepest first). A folder still in use is
# handed on to another install in the same place, so the last uninstall takes it away.
$createdDirs = @($lines | Where-Object { $_.StartsWith('created_dir=') } | ForEach-Object { $_.Substring(12) } | Sort-Object { $_.Length } -Descending)
if (-not $DryRun) { Remove-Item -LiteralPath $manifest -Force }
$left = @()
foreach ($rel in $createdDirs) {
  $d = Join-Path $base ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $d -PathType Container)) { continue }
  if (@(Get-ChildItem -LiteralPath $d -Force).Count -eq 0) { Write-Output "  remove the empty folder $d"; if (-not $DryRun) { Remove-Item -LiteralPath $d -Force } }
  else { $left += "created_dir=$rel" }
}
if ($left.Count -and -not $DryRun) {
  foreach ($m in Get-Others) {
    $o = Read-MhManifest $m.FullName
    foreach ($line in $left) { if ($o -notcontains $line) { [IO.File]::AppendAllText($m.FullName, "$line`n", $MhUtf8) } }
  }
}
if (-not $DryRun -and (Test-Path -LiteralPath $state)) {
  foreach ($d in @(Get-ChildItem -LiteralPath $state -Recurse -Directory -Force | Sort-Object { $_.FullName.Length } -Descending)) {
    if (@(Get-ChildItem -LiteralPath $d.FullName -Force).Count -eq 0) { Remove-Item -LiteralPath $d.FullName -Force }
  }
  if (@(Get-ChildItem -LiteralPath $state -Force).Count -eq 0) { Remove-Item -LiteralPath $state -Force }
}
if (-not $DryRun) { Write-Output "makkov-harness removed for $Agent. Restart the agent." }
else { Write-Output "Dry run done for $Agent. Run again without -DryRun to uninstall." }
