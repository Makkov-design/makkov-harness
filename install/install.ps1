<#
  makkov-harness installer for agents other than Claude (Windows PowerShell 5.1+ / PowerShell 7).
  Copies skills/ into the folder the agent reads and puts ROUTING.md into the agent's instructions
  file inside a marked block. Copies local files only; downloads nothing. Running it again updates.

  Usage: install.ps1 -Agent codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [-Project <path>] [-DryRun] [-Scope all|design]
    -DryRun          print every change it would make and write nothing
    -Scope design    route design work only: research reports, third-party installs and general coding
                     plugins are left out of the routing map (the skills are still copied). An update keeps
                     the scope of the earlier install unless you pass -Scope again.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider')]
  [string]$Agent,
  [string]$Project,
  [switch]$DryRun,
  [ValidateSet('all', 'design')]
  [string]$Scope
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
$repo = Split-Path -Parent $PSScriptRoot
$home_ = $env:USERPROFILE
$scopeGiven = $PSBoundParameters.ContainsKey('Scope')
if ($Project) { $Project = (Resolve-Path -LiteralPath $Project).Path }

$projectOnly = @('cursor', 'copilot', 'windsurf', 'aider')
if (($projectOnly -contains $Agent) -and -not $Project) {
  Write-Error "$Agent has no user-level instructions file this installer can edit. Pass -Project <path>."
}

$base = if ($Project) { $Project } else { $home_ }

switch ($Agent) {
  'cline'  { $skillsDir = Join-Path $base '.cline\skills' }
  'aider'  { $skillsDir = '' }
  default  { $skillsDir = Join-Path $base '.agents\skills' }
}
switch ($Agent) {
  'codex'    { $rules = if ($Project) { Join-Path $Project 'AGENTS.md' } else { Join-Path $home_ '.codex\AGENTS.md' } }
  'gemini'   { $rules = if ($Project) { Join-Path $Project 'GEMINI.md' } else { Join-Path $home_ '.gemini\GEMINI.md' } }
  'opencode' { $rules = if ($Project) { Join-Path $Project 'AGENTS.md' } else { Join-Path $home_ '.config\opencode\AGENTS.md' } }
  'cline'    { $rules = if ($Project) { Join-Path $Project 'AGENTS.md' } else { Join-Path $home_ '.agents\AGENTS.md' } }
  'cursor'   { $rules = Join-Path $Project '.cursor\rules\makkov-harness.mdc' }
  'aider'    { $rules = Join-Path $Project 'CONVENTIONS.md' }
  default    { $rules = Join-Path $Project 'AGENTS.md' }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$state = Join-Path $base '.makkov-harness'
$manifest = Join-Path $state "install-$Agent.txt"
$backupRoot = Join-Path (Join-Path $state 'backups') $stamp
if ($DryRun) { Write-Output 'Dry run: nothing will be written.' }
function Get-Manifests { if (Test-Path -LiteralPath $state) { @(Get-ChildItem -LiteralPath $state -Filter 'install-*.txt' -File) } else { @() } }

# 0. Before anything is written: the earlier install of this agent (its manifest, read with its paths moved
#    onto this folder if the folder was moved or renamed since), and markers the rewrite can trust.
$haveManifest = Test-Path -LiteralPath $manifest
$rulesExisted = '0'; $rulesBackup = ''; $oldBackups = @(); $oldCreated = @(); $oldSkills = @(); $oldSkillsDir = ''
if ($haveManifest) {
  $prev = Read-MhManifest $manifest
  $ob = Get-MhOldBase $prev
  $rulesExisted = Get-MhRaw $prev 'rules_existed'; $rulesBackup = Get-MhPath $prev 'rules_backup' $base
  $oldBackups = @($prev | Where-Object { $_.StartsWith('backup=') } | ForEach-Object { 'backup=' + (Get-MhRebased $_.Substring(7) $ob $base) })
  $oldCreated = @($prev | Where-Object { $_.StartsWith('created_dir=') })
  $oldSkills = @($prev | Where-Object { $_.StartsWith('skill=') })
  $oldSkillsDir = Get-MhPath $prev 'skills_dir' $base
  if (-not $scopeGiven) {
    $Scope = Get-MhRaw $prev 'scope'
    if ($Scope -eq 'design') { Write-Output 'Scope: design (kept from the earlier install; pass -Scope all to change it)' }
  }
}
if ($Scope -ne 'design') { $Scope = 'all' }
# Another agent installed into the same instructions file (Codex, Copilot, Windsurf, Cline and OpenCode all use
# <project>\AGENTS.md): this install shares its record of whether the file was yours before the harness.
if (-not $haveManifest) {
  foreach ($m in Get-Manifests) {
    $o = Read-MhManifest $m.FullName
    if (Test-MhSamePath (Get-MhPath $o 'rules' $base) $rules) {
      $rulesExisted = Get-MhRaw $o 'rules_existed'; $rulesBackup = Get-MhPath $o 'rules_backup' $base; break
    }
  }
}
$rulesIsFile = Test-Path -LiteralPath $rules -PathType Leaf
if (-not $haveManifest -and -not $rulesBackup -and $rulesIsFile -and -not ([IO.File]::ReadAllText($rules).Contains($MhStart))) { $rulesExisted = '1' }
if ($Agent -ne 'cursor') { $why = Test-MhMarkers $rules; if ($why) { Stop-MhMarkers $rules $why; exit 1 } }

# What earlier installs into this skills folder put there, from every manifest that points at it.
$earlier = @()
if ($skillsDir) {
  foreach ($m in Get-Manifests) {
    $o = Read-MhManifest $m.FullName
    if (Test-MhSamePath (Get-MhPath $o 'skills_dir' $base) $skillsDir) { $earlier += @($o | Where-Object { $_.StartsWith('skill=') }) }
  }
}
# Folders this install creates, so the uninstaller can take them away again once they are empty.
$created = New-Object System.Collections.Generic.List[string]
foreach ($c in $oldCreated) { $created.Add($c) }
function Add-Created([string]$Dir) {
  foreach ($d in @(Get-MhMissingDirs $Dir $base)) { if (-not $created.Contains("created_dir=$d")) { $created.Add("created_dir=$d") } }
}

# 1. Skills (rich-report needs Claude Artifacts, so it is skipped here).
# - a copy that is already exactly ours is left as it is;
# - the copy an earlier install of this harness put there is replaced;
# - a folder an install from before 0.5.0 put there (no fingerprint recorded, so it may have been edited) is
#   moved to backups\<date>\earlier-harness\ and left there;
# - anything else (your own skill, or ours that you edited) is moved to backups\<date>\skills\ and put back
#   by the uninstaller. Nothing is deleted that might be yours.
$copied = @(); $backed = @(); $older = @(); $dropped = @(); $manifestSkills = @()
if ($skillsDir) {
  if (-not $DryRun) { Add-Created $skillsDir; New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null }
  foreach ($src in @(Get-ChildItem -LiteralPath (Join-Path $repo 'skills') -Directory | Where-Object { $_.Name -ne 'rich-report' })) {
    $name = $src.Name
    $dst = Join-Path $skillsDir $name
    $idNew = Get-MhTreeId $src.FullName
    $copy = $true
    if (Test-Path -LiteralPath $dst) {
      $idOld = Get-MhTreeId $dst
      if ($idOld -eq $idNew) {
        $copy = $false
      } elseif ($earlier -contains "skill=$name $idOld") {
        if ($DryRun) { Write-Output "  would update $dst (a copy this harness put there)" } else { Remove-Item -LiteralPath $dst -Recurse -Force }
      } elseif ($earlier -contains "skill=$name") {
        $keep = Join-Path (Join-Path $backupRoot 'earlier-harness') $name
        if ($DryRun) { Write-Output "  would move $dst (from an install before 0.5.0) to $keep" }
        else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keep) | Out-Null; Move-Item -LiteralPath $dst -Destination $keep }
        $older += $name
      } else {
        $keep = Join-Path (Join-Path $backupRoot 'skills') $name
        if ($DryRun) { Write-Output "  would move your $dst to $keep, then copy ours" }
        else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keep) | Out-Null; Move-Item -LiteralPath $dst -Destination $keep }
        $backed += $name
      }
    } elseif ($DryRun) { Write-Output "  would copy $name to $dst" }
    if (-not $DryRun -and $copy) { Copy-Item -LiteralPath $src.FullName -Destination $dst -Recurse }
    $copied += $name
    $manifestSkills += "skill=$name $idNew"
  }

  # Skills the earlier install of this agent put there that this version no longer has (removed or renamed):
  # removed while still exactly as installed, moved to backups\<date>\removed\ if you changed them,
  # to backups\<date>\earlier-harness\ if the install was from before 0.5.0. Another agent's copy stays.
  foreach ($line in $oldSkills) {
    $name, $id = $line.Substring(6) -split ' ', 2
    if ($manifestSkills | Where-Object { $_.StartsWith("skill=$name ") }) { continue }
    if (-not (Test-MhSamePath $oldSkillsDir $skillsDir)) { continue }
    $dst = Join-Path $skillsDir $name
    if (-not (Test-Path -LiteralPath $dst)) { continue }
    $other = $false
    foreach ($m in Get-Manifests) {
      if (Test-MhSamePath $m.FullName $manifest) { continue }
      $o = Read-MhManifest $m.FullName
      if ((Test-MhSamePath (Get-MhPath $o 'skills_dir' $base) $skillsDir) -and ($o | Where-Object { $_ -eq "skill=$name" -or $_.StartsWith("skill=$name ") })) { $other = $true }
    }
    if ($other) { Write-Output "  keep $dst (no longer part of the harness, but another installed agent lists it)"; continue }
    if ($id -and (Get-MhTreeId $dst) -eq $id) {
      if ($DryRun) { Write-Output "  would remove $dst (no longer part of the harness)" } else { Remove-Item -LiteralPath $dst -Recurse -Force }
    } else {
      $keep = if ($id) { Join-Path (Join-Path $backupRoot 'removed') $name } else { Join-Path (Join-Path $backupRoot 'earlier-harness') $name }
      $why = if ($id) { 'you changed it' } else { 'from an install before 0.5.0' }
      if ($DryRun) { Write-Output "  would move $dst (no longer part of the harness; $why) to $keep" }
      else { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keep) | Out-Null; Move-Item -LiteralPath $dst -Destination $keep }
    }
    $dropped += $name
  }
}

# 2. Routing block.
$routing = [IO.File]::ReadAllText((Join-Path $repo 'ROUTING.md')) -replace "`r`n", "`n"
$routing = $routing.Replace('`rich-report` (Claude with Artifacts) or `html-report` (any agent)', '`html-report`').TrimEnd("`n")
if ($Scope -eq 'design') {
  # Design work only: drop the rows that route research, installs and general coding.
  $drop = '^\| (Research, analysis|Installing, adding|Any new feature or creative work|Whole-project security review)'
  $routing = (($routing -split "`n") | Where-Object { $_ -notmatch $drop }) -join "`n"
  $routing = $routing.TrimEnd("`n") + "`n`nScope: design work only (installed with -Scope design). For research, installs and general coding, work as you would without this harness."
}
$block = "$MhStart`n$routing`n$MhEnd"
# The file before the harness first changed it is kept once, as .makkov-harness\backups\original\<path>.
# The uninstaller uses it to put the file back exactly as it was.
$original = Join-Path (Join-Path (Join-Path $state 'backups') 'original') ((Get-MhRel $rules $base) -replace '/', [IO.Path]::DirectorySeparatorChar)
if ($DryRun) {
  if ($rulesIsFile) {
    if ($rulesExisted -eq '1' -and -not $rulesBackup) { Write-Output "  would keep a copy of $rules as it is now in $original" }
    if ($Agent -eq 'cursor') { Write-Output "  would rewrite $rules with the routing rule" }
    elseif ([IO.File]::ReadAllText($rules).Contains($MhStart)) { Write-Output "  would update the marked routing block in $rules" }
    else { Write-Output "  would append the marked routing block to $rules" }
  } else { Write-Output "  would create $rules with the routing block" }
  Write-Output "Dry run done for $Agent. Run again without -DryRun to install."
  return
}
Add-Created (Split-Path -Parent $rules)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $rules) | Out-Null
if ($Agent -eq 'cursor') {
  $content = "---`ndescription: makkov-harness routing - which skill fits which situation`nalwaysApply: true`n---`n$block`n"
} elseif ($rulesIsFile -and [IO.File]::ReadAllText($rules).Contains($MhStart)) {
  $content = Get-MhReplacedBlock $rules $block
} elseif ($rulesIsFile -and (Get-Item -LiteralPath $rules).Length -gt 0) {
  # Appended after one blank line; a file that does not end in a newline gets one first.
  $old = [IO.File]::ReadAllText($rules)
  if (-not $old.EndsWith("`n")) { $old += "`n" }
  $content = $old + "`n" + $block + "`n"
} else {
  $content = $block + "`n"
}
if ($rulesIsFile -and [IO.File]::ReadAllText($rules) -ceq $content) {
  # already up to date: the file is not touched
} else {
  if ($rulesIsFile -and $rulesExisted -eq '1' -and -not $rulesBackup) {
    Add-Created (Split-Path -Parent $original); New-Item -ItemType Directory -Force -Path (Split-Path -Parent $original) | Out-Null
    [IO.File]::WriteAllBytes($original, [IO.File]::ReadAllBytes($rules)); $rulesBackup = $original
  }
  Write-MhText $rules $content
}

# 3. Manifest: what this install put where, so install/uninstall.ps1 removes exactly that.
# Paths are absolute; base= says which folder they were written for, so a moved folder can still be read.
Add-Created $state
New-Item -ItemType Directory -Force -Path $state | Out-Null
$lines = @("agent=$Agent", "installed=$stamp", "base=$base", "skills_dir=$skillsDir", "rules=$rules", "rules_existed=$rulesExisted", "rules_backup=$rulesBackup", "scope=$Scope") + $oldBackups
if ($backed.Count) { $lines += "backup=" + (Join-Path $backupRoot 'skills') }
$lines += @($created | Where-Object { $_ -ne 'created_dir=.makkov-harness' -and -not $_.StartsWith('created_dir=.makkov-harness/') })
$lines += $manifestSkills
[IO.File]::WriteAllLines($manifest, [string[]]$lines, $MhUtf8)

Write-Output "makkov-harness installed for $Agent"
if ($skillsDir) { Write-Output ("Skills -> $skillsDir : " + ($copied -join ', ')) }
if ($backed.Count) { Write-Output ("Kept your earlier versions of: " + ($backed -join ', ') + " -> " + (Join-Path $backupRoot 'skills')) }
if ($older.Count) { Write-Output ("Moved the copies an install before 0.5.0 left of: " + ($older -join ', ') + " -> " + (Join-Path $backupRoot 'earlier-harness') + " (delete them if you never edited them)") }
if ($dropped.Count) { Write-Output ("No longer part of the harness, taken out of ${skillsDir}: " + ($dropped -join ', ')) }
Write-Output "Routing -> $rules"
if ($Agent -eq 'aider') { Write-Output "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project." }
Write-Output 'Restart the agent, then run the harness-onboarding skill to personalize it.'
