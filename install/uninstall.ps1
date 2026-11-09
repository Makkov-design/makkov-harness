<#
  Removes what install.ps1 put in place for one agent, using the manifest it wrote
  (.makkov-harness\install-<agent>.txt in your home or project folder).
  - Skill folders: removed only if they are still identical to the copy in this repository; a folder you
    changed is moved to .makkov-harness\backups\<date>\removed\ instead. Folders another installed agent
    still uses from the same place are left alone.
  - Skills of yours that the install moved aside are put back.
  - The routing block is taken out of the instructions file; a Cursor rule is deleted and your earlier
    rule, if there was one, is restored. A file the install created and that is now empty is deleted.

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
$repo = Split-Path -Parent $PSScriptRoot
if ($Project) { $Project = (Resolve-Path $Project).Path }
$base = if ($Project) { $Project } else { $env:USERPROFILE }
$state = Join-Path $base '.makkov-harness'
$manifest = Join-Path $state "install-$Agent.txt"
if (-not (Test-Path $manifest)) {
  Write-Error ("No makkov-harness install for $Agent found in $base (no $manifest). " +
    'If you installed before 0.3.3, remove the skill folders and the marked block by hand; see INSTALL.md.')
}

$lines = Get-Content $manifest -Encoding UTF8
function Get-Value([string]$Key) { (($lines | Where-Object { $_ -like "$Key=*" } | Select-Object -First 1) -replace "^$Key=", '') }
$skillsDir = Get-Value 'skills_dir'; $rules = Get-Value 'rules'
$rulesExisted = Get-Value 'rules_existed'; $rulesBackup = Get-Value 'rules_backup'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pattern = '(?s)<!-- makkov-harness:start -->.*?<!-- makkov-harness:end -->'
if ($DryRun) { Write-Output 'Dry run: nothing will be changed.' }

function Get-TreeFingerprint([string]$Dir) {
  $root = (Resolve-Path $Dir).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
  (Get-ChildItem $root -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
    $_.FullName.Substring($root.Length) + ':' + (Get-FileHash $_.FullName -Algorithm SHA256).Hash
  }) -join "`n"
}
function Test-Shared([string]$Name) {
  foreach ($m in Get-ChildItem $state -Filter 'install-*.txt') {
    if ($m.FullName -eq $manifest) { continue }
    $o = Get-Content $m.FullName -Encoding UTF8
    if ((($o | Where-Object { $_ -like 'skills_dir=*' } | Select-Object -First 1) -replace '^skills_dir=', '') -eq $skillsDir -and
        ($o | Where-Object { $_ -eq "skill=$Name" -or $_ -like "skill=$Name *" })) { return $true }
  }
  return $false
}
function Get-TreeId([string]$Dir) {
  $bytes = [Text.Encoding]::UTF8.GetBytes((Get-TreeFingerprint $Dir))
  $sha = [Security.Cryptography.SHA256]::Create()
  (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}

# 1. Skills. A folder still matching the fingerprint the install recorded is ours and is removed; one that
# changed since is moved aside. Installs from before 0.5.0 recorded no fingerprint: compare with this copy.
if ($skillsDir) {
  foreach ($entry in ($lines | Where-Object { $_ -like 'skill=*' } | ForEach-Object { $_ -replace '^skill=', '' })) {
    $name, $id = $entry -split ' ', 2
    $dst = Join-Path $skillsDir $name
    if (-not (Test-Path $dst)) { continue }
    if (Test-Shared $name) { Write-Output "  keep $dst (another installed agent uses it)"; continue }
    $ours = Join-Path (Join-Path $repo 'skills') $name
    if (($id -and (Get-TreeId $dst) -eq $id) -or
        (-not $id -and (Test-Path $ours) -and ((Get-TreeFingerprint $ours) -eq (Get-TreeFingerprint $dst)))) {
      Write-Output "  remove $dst"; if (-not $DryRun) { Remove-Item $dst -Recurse -Force }
    } else {
      $to = Join-Path (Join-Path (Join-Path (Join-Path $state 'backups') $stamp) 'removed') $name
      Write-Output "  move $dst to $to (you changed it)"
      if (-not $DryRun) { New-Item -ItemType Directory -Force (Split-Path -Parent $to) | Out-Null; Move-Item $dst $to }
    }
  }
  # 2. Put back the skills the install moved aside. While another agent still uses this skills folder,
  #    hand the record of those backups on to its manifest, so its uninstall restores them.
  $myBackups = @($lines | Where-Object { $_ -like 'backup=*' })
  foreach ($m in Get-ChildItem $state -Filter 'install-*.txt') {
    if ($m.FullName -eq $manifest) { continue }
    $o = @(Get-Content $m.FullName -Encoding UTF8)
    if ((($o | Where-Object { $_ -like 'skills_dir=*' } | Select-Object -First 1) -replace '^skills_dir=', '') -ne $skillsDir) { continue }
    foreach ($line in $myBackups) {
      if ($o -notcontains $line) {
        Write-Output "  hand the backup record on to $($m.Name)"
        if (-not $DryRun) { Add-Content $m.FullName $line -Encoding UTF8 }
      }
    }
  }
  foreach ($b in ($lines | Where-Object { $_ -like 'backup=*' } | ForEach-Object { $_ -replace '^backup=', '' })) {
    if (-not (Test-Path $b)) { continue }
    foreach ($d in Get-ChildItem $b -Directory) {
      $dst = Join-Path $skillsDir $d.Name
      if (Test-Path $dst) { Write-Output "  leave your earlier $($d.Name) in $b ($dst exists)" }
      else { Write-Output "  restore your $($d.Name) to $dst"; if (-not $DryRun) { Move-Item $d.FullName $dst } }
    }
  }
}

# 3. Routing.
if (Test-Path $rules) {
  if ($Agent -eq 'cursor') {
    Write-Output "  delete $rules"; if (-not $DryRun) { Remove-Item $rules -Force }
    if ($rulesBackup -and (Test-Path $rulesBackup)) {
      Write-Output "  restore your earlier rule from $rulesBackup"; if (-not $DryRun) { Copy-Item $rulesBackup $rules }
    }
  } else {
    $old = [IO.File]::ReadAllText($rules)
    if ($old -match $pattern) {
      Write-Output "  take the routing block out of $rules"
      if (-not $DryRun) {
        Copy-Item $rules "$rules.bak-$stamp"
        $new = [regex]::Replace($old, "(\r?\n)?$pattern(\r?\n)?", "`n")
        if ($rulesExisted -ne '1' -and -not $new.Trim()) {
          Remove-Item $rules, "$rules.bak-$stamp" -Force
          Write-Output "  delete $rules (the install created it and it is now empty)"
        } else { [IO.File]::WriteAllText($rules, $new, (New-Object System.Text.UTF8Encoding $false)) }
      }
    }
  }
}

if (-not $DryRun) { Remove-Item $manifest -Force; Write-Output "makkov-harness removed for $Agent. Restart the agent." }
else { Write-Output "Dry run done for $Agent. Run again without -DryRun to uninstall." }
