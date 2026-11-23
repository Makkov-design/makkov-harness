<#
  Removes what install.ps1 put in place for one agent, using the manifest it wrote
  (.makkov-harness\install-<agent>.txt in your home or project folder).
  - Skill folders: removed only if they are still identical to a copy the harness put there; a folder you
    changed is moved to .makkov-harness\backups\<date>\removed\ instead. Folders another installed agent
    still uses from the same place are left alone.
  - Skills of yours that the install moved aside are put back.
  - The routing block, and the personal layer harness-onboarding wrote, are taken out of the instructions
    file, unless another installed agent still reads that file. A file you had before the install is put back
    byte for byte when you have not changed it since; otherwise the copy of it as it was stays in
    .makkov-harness\backups\original\. A Cursor rule (and its personal rule) is deleted and your earlier rule,
    if there was one, is restored. A file the install created and that is now empty is deleted, and so are the
    folders the install created, once empty. A symlink is never deleted.
  - The manifest names absolute paths; if the home or project folder was moved or renamed since the install,
    they are read relative to the folder you pass now. A manifest that names paths the installer would not
    use is refused, and nothing is changed.

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
$home_ = $env:USERPROFILE
if ($Project) { $Project = (Resolve-Path -LiteralPath $Project).ProviderPath }
if ($Project -and (Test-MhSamePath $Project ((Resolve-Path -LiteralPath $home_).ProviderPath))) {
  [Console]::Error.WriteLine('The project path is your home folder. For a user-level install, leave -Project out.'); exit 2
}
$base = if ($Project) { $Project } else { $home_ }
$state = Join-Path $base '.makkov-harness'
$manifest = Join-Path $state "install-$Agent.txt"
if (-not (Test-Path -LiteralPath $manifest)) {
  [Console]::Error.WriteLine("No makkov-harness install for $Agent found in $base (no $manifest).")
  [Console]::Error.WriteLine('If you installed before 0.3.3, remove the skill folders and the marked block by hand; see INSTALL.md.')
  exit 1
}
function Stop-Mh([string]$Why) { [Console]::Error.WriteLine($Why); [Console]::Error.WriteLine('Nothing was changed.'); exit 1 }

# 0. Before anything is changed: every manifest here must be one the installer wrote for this folder, and the
#    files to change must be changeable.
foreach ($m in @(Get-ChildItem -LiteralPath $state -Filter 'install-*.txt' -File)) {
  $why = Test-MhValidManifest $m.FullName $base $Project $home_
  if ($why) { Stop-Mh "$($m.FullName) does not look like a manifest this installer wrote: $why. Move it out of $state and run this again." }
}
$paths = Get-MhPaths $Agent $Project $home_
$skillsDir = $paths.Skills; $rules = $paths.Rules
$lines = Read-MhManifest $manifest
$ob = Get-MhOldBase $lines
$rulesExisted = Get-MhRaw $lines 'rules_existed'; $rulesBackup = Get-MhPath $lines 'rules_backup' $base
if ($ob -and $ob -ne $base) { Write-Output "Installed in $ob, which is now ${base}: reading the install from here." }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

# Other installs in the same folder that read the same skills folder or the same instructions file.
function Get-Others { @(Get-ChildItem -LiteralPath $state -Filter 'install-*.txt' -File | Where-Object { -not (Test-MhSamePath $_.FullName $manifest) }) }
function Test-SameSkills([string[]]$O) { Test-MhSamePath (Get-MhPath $O 'skills_dir' $base) $skillsDir }
$rulesUsers = @()
foreach ($m in Get-Others) {
  $o = Read-MhManifest $m.FullName
  if (Test-MhSamePath (Get-MhPath $o 'rules' $base) $rules) { $rulesUsers += (Get-MhRaw $o 'agent') }
}
$rulesIsFile = [IO.File]::Exists($rules) -and -not [IO.Directory]::Exists($rules)
$dangling = Test-MhDangling $rules
$editRules = $false
if (-not $rulesUsers.Count -and $rulesIsFile -and -not $dangling) {
  if ($Agent -eq 'cursor') { $editRules = $true }
  else { $t = Read-MhText $rules; if ($t.Contains($MhStart) -or $t.Contains($MhPStart)) { $editRules = $true } }
}
if ($editRules) {
  $why = Test-MhWritableFile $rules; if ($why) { Stop-Mh "$why." }
  if ($Agent -ne 'cursor') {
    $why = Test-MhMarkers $rules; if ($why) { Stop-MhMarkers $rules $why; exit 1 }
    if (Test-MhWideText $rules) { Stop-Mh "$rules is saved as UTF-16 or UTF-32. Save it as UTF-8, then run this again." }
  }
}
if ($DryRun) { Write-Output 'Dry run: nothing will be changed.' }

# 1. Skills. A folder is ours when it matches a fingerprint the harness recorded for it here (in this manifest
# or another agent's) or this repository's copy; one that changed since is moved aside.
if ($skillsDir) {
  $names = @($lines | Where-Object { $_.StartsWith('skill=') } | ForEach-Object { ($_.Substring(6) -split ' ')[0] } | Select-Object -Unique)
  foreach ($name in $names) {
    $dst = Join-Path $skillsDir $name
    if (-not (Test-Path -LiteralPath $dst)) { continue }
    $shared = @()
    foreach ($m in Get-Others) {
      $o = Read-MhManifest $m.FullName
      if ((Test-SameSkills $o) -and ($o | Where-Object { $_ -eq "skill=$name" -or $_.StartsWith("skill=$name ") })) { $shared += $m }
    }
    if ($shared.Count) {
      Write-Output "  keep $dst (another installed agent uses it)"
      # Hand on the fingerprints recorded here, so the last uninstall still knows this copy is the harness's.
      foreach ($m in $shared) {
        $o = Read-MhManifest $m.FullName
        foreach ($l in @($lines | Where-Object { $_ -cmatch "^skill=$([regex]::Escape($name)) [0-9a-f]+$" })) {
          if ($o -notcontains $l -and -not $DryRun) { [IO.File]::AppendAllText($m.FullName, "$l`r`n", $MhUtf8) }
        }
      }
      continue
    }
    $ids = Get-MhTreeIds $dst
    $ours = [bool](@($ids | Where-Object { $lines -contains "skill=$name $_" }).Count)
    $mine = Join-Path (Join-Path $repo 'skills') $name
    if (-not $ours -and (Test-Path -LiteralPath $mine)) { $ours = $ids -contains (Get-MhTreeId $mine) }
    if (-not $ours) {
      foreach ($m in Get-Others) {
        $o = Read-MhManifest $m.FullName
        if ((Test-SameSkills $o) -and @($ids | Where-Object { $o -contains "skill=$name $_" }).Count) { $ours = $true }
      }
    }
    if ($ours) {
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
    if (-not (Test-SameSkills $o)) { continue }
    foreach ($b in $myBackups) {
      if ($o -notcontains "backup=$b") {
        Write-Output "  hand the backup record on to $($m.Name)"
        if (-not $DryRun) { [IO.File]::AppendAllText($m.FullName, "backup=$b`r`n", $MhUtf8) }
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
  # The skills are done: a run after an interruption from here on does not take them up again.
  if (-not $DryRun) {
    $lines = @($lines | Where-Object { -not $_.StartsWith('skill=') -and -not $_.StartsWith('backup=') })
    [IO.File]::WriteAllLines("$manifest.new", [string[]]$lines, $MhUtf8); Move-Item -LiteralPath "$manifest.new" -Destination $manifest -Force
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
$oursBackup = $rulesBackup -and (Test-MhUnder $rulesBackup (Join-Path (Join-Path $state 'backups') 'original'))
$haveBackup = $rulesBackup -and [IO.File]::Exists($rulesBackup)
if ($rulesUsers.Count) {
  Write-Output ("  keep the routing block in $rules (also installed there for: " + ($rulesUsers -join ', ') + ")")
} elseif ($dangling) {
  Write-Output "  leave $rules alone (a symlink to a file that does not exist)"
} elseif ($editRules -and $Agent -eq 'cursor') {
  if ($haveBackup) { Write-Output "  restore your earlier rule from $rulesBackup"; if (-not $DryRun) { Copy-MhBytes $rulesBackup $rules } }
  elseif (Test-MhLink $rules) { Write-Output "  empty $rules (a symlink, so it is left in place)"; if (-not $DryRun) { Write-MhText $rules '' } }
  else { Write-Output "  delete $rules"; if (-not $DryRun) { Remove-Item -LiteralPath $rules -Force } }
} elseif ($editRules) {
  Write-Output "  take the routing block and the personal layer out of $rules"
  if (-not $DryRun) {
    $layer = Get-MhPersonalLayer $rules
    if ($layer) {
      New-Item -ItemType Directory -Force -Path $kept | Out-Null; Write-MhText (Join-Path $kept 'personal-layer.md') $layer
      Write-Output "  your personal layer is kept in $(Join-Path $kept 'personal-layer.md')"
    }
    $new = Get-MhRemovedBlocks $rules
    $tmp = Join-Path $state "removed-$stamp.tmp"; Write-MhText $tmp $new
    # Unchanged since the install apart from the harness's blocks: put back byte for byte.
    if ($haveBackup -and (Test-MhSameText $tmp $rulesBackup)) { Copy-MhBytes $rulesBackup $tmp }
    if ($rulesExisted -ne '1' -and -not (Read-MhText $tmp).Trim() -and -not (Test-MhLink $rules)) {
      Remove-Item -LiteralPath $rules -Force
      Write-Output "  delete $rules (the install created it and it is now empty)"
    } else { Copy-MhBytes $tmp $rules }
    Remove-Item -LiteralPath $tmp -Force
  }
}
# The copy of the file as it was goes once the file is back as it was; otherwise it stays, and you are told.
if (-not $rulesUsers.Count -and $oursBackup -and $haveBackup) {
  if ([IO.File]::Exists($rules) -and ([Convert]::ToBase64String((Read-MhBytes $rules)) -ceq [Convert]::ToBase64String((Read-MhBytes $rulesBackup)))) {
    if (-not $DryRun) { Remove-Item -LiteralPath $rulesBackup -Force }
  } elseif (-not $DryRun) { Write-Output "  your $rules as it was before the first install is kept in $rulesBackup (it differs from the file now)" }
}

# 4. The manifest, then the folders the install created, once empty (deepest first). A folder still in use is
# handed on to another install in the same place, so the last uninstall takes it away.
$createdDirs = @($lines | Where-Object { $_.StartsWith('created_dir=') } | ForEach-Object { $_.Substring(12) } | Sort-Object { $_.Length } -Descending)
if (-not $DryRun) { Remove-Item -LiteralPath $manifest -Force }
$left = @()
foreach ($rel in $createdDirs) {
  $d = Join-Path $base ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $d -PathType Container)) { continue }
  if (-not (Test-MhLink $d) -and @(Get-ChildItem -LiteralPath $d -Force).Count -eq 0) { Write-Output "  remove the empty folder $d"; if (-not $DryRun) { Remove-Item -LiteralPath $d -Force } }
  else { $left += "created_dir=$rel" }
}
if ($left.Count -and -not $DryRun) {
  foreach ($m in Get-Others) {
    $o = Read-MhManifest $m.FullName
    foreach ($line in $left) { if ($o -notcontains $line) { [IO.File]::AppendAllText($m.FullName, "$line`r`n", $MhUtf8) } }
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
