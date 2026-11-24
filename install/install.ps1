<#
  makkov-harness installer for agents other than Claude (Windows PowerShell 5.1+ / PowerShell 7).
  Copies skills/ into the folder the agent reads and puts ROUTING.md into the agent's instructions
  file inside a marked block. Copies local files only; downloads nothing. Running it again updates.

  Usage: install.ps1 -Agent codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [-Project <path>] [-DryRun] [-Scope all|design]
    -DryRun          print every change it would make and write nothing
    -Scope design    route design work only: research reports, third-party installs and general coding
                     plugins are left out of the routing map (the skills are still copied). An update keeps
                     the scope of the earlier install unless you pass -Scope again.

  The order is the safety: everything that can fail is checked before the first change; the manifest
  (.makkov-harness\install-<agent>.txt) records what the run is about to do before it does it, so an
  interrupted run can be run again or uninstalled; the instructions file is kept once, as it was, before the
  harness first changes it; and a manifest is read as untrusted input (install\lib.ps1, Test-MhValidManifest).
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
if ($Project) { $Project = (Resolve-Path -LiteralPath $Project).ProviderPath }

$projectOnly = @('cursor', 'copilot', 'windsurf', 'aider')
if (($projectOnly -contains $Agent) -and -not $Project) {
  [Console]::Error.WriteLine("$Agent has no user-level instructions file this installer can edit. Pass -Project <path>."); exit 2
}
if ($Project -and (Test-MhSamePath $Project ((Resolve-Path -LiteralPath $home_).ProviderPath))) {
  [Console]::Error.WriteLine('The project path is your home folder, where a user-level install keeps its manifest. Leave -Project out for a user-level install, or pass a project folder.'); exit 2
}

$base = if ($Project) { $Project } else { $home_ }
$paths = Get-MhPaths $Agent $Project $home_
$skillsDir = $paths.Skills; $rules = $paths.Rules

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$state = Join-Path $base '.makkov-harness'
$manifest = Join-Path $state "install-$Agent.txt"
# One folder per run and agent: two agents installed in the same second never share a backup folder (each
# uninstall puts back what its own folder holds, into its own skills folder).
$backupRoot = Join-Path (Join-Path $state 'backups') "$stamp-$Agent"
$original = Join-Path (Join-Path (Join-Path $state 'backups') 'original') ((Get-MhRel $rules $base) -replace '/', [IO.Path]::DirectorySeparatorChar)
if ($DryRun) { Write-Output 'Dry run: nothing will be written.' }
function Stop-Mh([string]$Why) { [Console]::Error.WriteLine($Why); [Console]::Error.WriteLine('Nothing was changed.'); exit 1 }
# Test hook, inert in normal use: with both MAKKOV_HARNESS_TEST=1 and MAKKOV_HARNESS_TEST_STOP=<point> set, the
# run stops at that point (skill = after the first skill is in place, skills, rules), as an interruption would.
# install\test\ uses it to check that an interrupted run can be run again or uninstalled.
function Test-Checkpoint([string]$Name) { if ($env:MAKKOV_HARNESS_TEST -eq '1' -and $env:MAKKOV_HARNESS_TEST_STOP -eq $Name) { [Console]::Error.WriteLine("(test) stopped after $Name"); exit 1 } }
function Get-Manifests { if (Test-Path -LiteralPath $state) { @(Get-ChildItem -LiteralPath $state -Filter 'install-*.txt' -File) } else { @() } }

# One run at a time in this folder (a dry run writes nothing, so it takes no lock). The lock is let go in the finally
# at the end of this file, whichever way the run ends (exit and the test stop points included).
$mhLock = if ($DryRun) { $null } else { Enter-MhLock $state $base }
try {

# 0. Before anything is written.
# Every manifest in this folder must be one the installer wrote for this folder.
foreach ($m in Get-Manifests) {
  $why = Test-MhValidManifest $m.FullName $base $Project $home_
  if ($why) { Stop-Mh "$($m.FullName) does not look like a manifest this installer wrote: $why. Move it out of $state and run this again." }
}
# The earlier install of this agent, with its paths moved onto this folder if the folder was moved or renamed.
$haveManifest = Test-Path -LiteralPath $manifest
$rulesExisted = '0'; $rulesBackup = ''; $oldBackups = @(); $oldCreated = @(); $oldSkills = @()
if ($haveManifest) {
  $prev = Read-MhManifest $manifest
  $ob = Get-MhOldBase $prev
  $rulesExisted = Get-MhRaw $prev 'rules_existed'; $rulesBackup = Get-MhPath $prev 'rules_backup' $base
  $oldBackups = @($prev | Where-Object { $_.StartsWith('backup=') } | ForEach-Object { 'backup=' + (Get-MhRebased $_.Substring(7) $ob $base) })
  $oldCreated = @($prev | Where-Object { $_.StartsWith('created_dir=') })
  $oldSkills = @($prev | Where-Object { $_.StartsWith('skill=') })
  if (-not $scopeGiven) {
    $Scope = Get-MhRaw $prev 'scope'
    if ($Scope -eq 'design') { Write-Output 'Scope: design (kept from the earlier install; pass -Scope all to change it)' }
  }
}
if ($Scope -ne 'design') { $Scope = 'all' }
# Another agent installed into the same instructions file (Codex, Copilot, Windsurf, Cline and OpenCode all use
# <project>\AGENTS.md): this install shares its record of the file as it was before the harness.
$sharedRules = $false
if (-not $haveManifest) {
  foreach ($m in Get-Manifests) {
    $o = Read-MhManifest $m.FullName
    if (Test-MhSamePath (Get-MhPath $o 'rules' $base) $rules) {
      $rulesExisted = Get-MhRaw $o 'rules_existed'; $rulesBackup = Get-MhPath $o 'rules_backup' $base; $sharedRules = $true; break
    }
  }
}
# A file that is there at the first install is kept, as it was, whatever it holds (a marked block too). A copy
# an interrupted earlier run left in backups\original\ is the file as it was, so it is used, never replaced.
# When another agent's install already names the file, its record stands: the harness made the file or kept it.
$rulesIsFile = [IO.File]::Exists($rules) -and -not [IO.Directory]::Exists($rules)
$needCopy = $false
if (-not $haveManifest -and -not $sharedRules -and -not $rulesBackup) {
  if ([IO.File]::Exists($original)) { $rulesExisted = '1'; $rulesBackup = $original }
  elseif ($rulesIsFile) { $rulesExisted = '1'; $rulesBackup = $original; $needCopy = $true }
}
if ($rulesBackup -and (Test-MhSamePath $rulesBackup $original) -and -not [IO.File]::Exists($original) -and $rulesIsFile) { $needCopy = $true }
# Files and folders it is about to change: they must be there to change, or creatable.
$why = Test-MhWritableFile $rules; if ($why) { Stop-Mh "$why." }
if ($Agent -ne 'cursor') {
  $why = Test-MhMarkers $rules; if ($why) { Stop-MhMarkers $rules $why; exit 1 }
  if (Test-MhWideText $rules) { Stop-Mh "$rules is saved as UTF-16 or UTF-32. Save it as UTF-8, then run this again." }
}
if ($skillsDir) { $why = Test-MhWritableDir $skillsDir; if ($why) { Stop-Mh "$why." } }
$why = Test-MhWritableDir $state; if ($why) { Stop-Mh "$why." }

# What earlier installs into this skills folder put there, from every manifest that points at it.
$earlier = @()
if ($skillsDir) {
  foreach ($m in Get-Manifests) {
    $o = Read-MhManifest $m.FullName
    if (Test-MhSamePath (Get-MhPath $o 'skills_dir' $base) $skillsDir) { $earlier += @($o | Where-Object { $_.StartsWith('skill=') }) }
  }
}
# This version's skills (rich-report needs Claude Artifacts, so it is skipped here) and their fingerprints.
$sources = @(); $manifestSkills = @(); $idOf = @{}
if ($skillsDir) {
  $sources = @(Get-ChildItem -LiteralPath (Join-Path $repo 'skills') -Directory | Where-Object { $_.Name -ne 'rich-report' } | Sort-Object Name)
  foreach ($src in $sources) {
    $id = Get-MhTreeId $src.FullName; $idOf[$src.Name] = $id; $manifestSkills += "skill=$($src.Name) $id"
    # A file (not a folder) where a skill folder goes: stop now rather than half way.
    $dst = Join-Path $skillsDir $src.Name
    if (([IO.File]::Exists($dst) -or (Test-MhLink $dst)) -and -not [IO.Directory]::Exists($dst)) {
      Stop-Mh "$dst is a file, where the $($src.Name) skill folder goes. Move it away, then run this again."
    }
  }
}

# Folders this install creates, so the uninstaller can take them away again once they are empty.
$created = New-Object System.Collections.Generic.List[string]
foreach ($c in $oldCreated) { $created.Add($c) }
function Add-Created([string]$Dir) {
  foreach ($d in @(Get-MhMissingDirs $Dir $base)) { if (-not $created.Contains("created_dir=$d")) { $created.Add("created_dir=$d") } }
}
if ($skillsDir) { Add-Created $skillsDir }
Add-Created (Split-Path -Parent $rules)

# The manifest: what this install puts where, so install\uninstall.ps1 removes exactly that. Paths are
# absolute; base= says which folder they were written for, so a moved folder can still be read.
function Write-Manifest([string[]]$SkillLines, [string[]]$BackupLines) {
  New-Item -ItemType Directory -Force -Path $state | Out-Null
  $lines = @("agent=$Agent", "installed=$stamp", "base=$base", "skills_dir=$skillsDir", "rules=$rules", "rules_existed=$rulesExisted", "rules_backup=$rulesBackup", "scope=$Scope")
  $lines += @($BackupLines | Where-Object { $_ })
  $lines += @($created | Where-Object { $_ -ne 'created_dir=.makkov-harness' -and -not $_.StartsWith('created_dir=.makkov-harness/') })
  $lines += @($SkillLines | Where-Object { $_ } | Select-Object -Unique)
  [IO.File]::WriteAllLines("$manifest.new", [string[]]$lines, $MhUtf8)
  Move-Item -LiteralPath "$manifest.new" -Destination $manifest -Force
}

if ($DryRun) {
  foreach ($src in $sources) {
    $name = $src.Name; $dst = Join-Path $skillsDir $name
    if (-not (Test-Path -LiteralPath $dst)) { Write-Output "  would copy $name to $dst"; continue }
    $ids = Get-MhTreeIds $dst
    if ($ids -contains $idOf[$name]) { }
    elseif (@($ids | Where-Object { $earlier -contains "skill=$name $_" }).Count) { Write-Output "  would update $dst (a copy this harness put there)" }
    elseif ($earlier -contains "skill=$name") { Write-Output "  would move $dst (from an install before 0.5.0) to $(Join-Path (Join-Path $backupRoot 'earlier-harness') $name)" }
    else { Write-Output "  would move your $dst to $(Join-Path (Join-Path $backupRoot 'skills') $name), then copy ours" }
  }
  if ($needCopy) { Write-Output "  would keep a copy of $rules as it is now in $original" }
  if ($rulesIsFile) {
    if ($Agent -eq 'cursor') { Write-Output "  would rewrite $rules with the routing rule" }
    elseif ((Read-MhText $rules).Contains($MhStart)) { Write-Output "  would update the marked routing block in $rules" }
    else { Write-Output "  would append the marked routing block to $rules" }
  } else { Write-Output "  would create $rules with the routing block" }
  Write-Output "Dry run done for $Agent. Run again without -DryRun to install."
  return
}

# The journal: before the first change, the manifest already lists the folders and backups this run may leave
# behind and the earlier install's skills. Each skill of this version is added to it once it is in place, so
# a skill of yours the run did not reach is never taken for the harness's.
Write-Manifest $oldSkills ($oldBackups + @('backup=' + (Join-Path $backupRoot 'skills')))
foreach ($t in @(Get-ChildItem -LiteralPath $state -Force -Filter 'install-*.txt.new' -File)) { Remove-Item -LiteralPath $t.FullName -Force }
foreach ($t in "$rules.mh-tmp", "$original.mh-tmp") { if ([IO.File]::Exists($t)) { Remove-Item -LiteralPath $t -Force } }

# 1. Skills.
# - a copy that is already exactly ours is left as it is;
# - the copy an earlier install of this harness put there is replaced;
# - a folder an install from before 0.5.0 put there (no fingerprint recorded, so it may have been edited) is
#   moved to backups\<date>\earlier-harness\ and left there;
# - anything else (your own skill, or ours that you edited) is moved to backups\<date>\skills\ and put back
#   by the uninstaller. Nothing is deleted that might be yours.
# Each copy goes to a temporary name first and is then renamed, so an interrupted copy is never taken for yours.
$copied = @(); $backed = @(); $older = @(); $dropped = @()
if ($skillsDir) {
  New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
  foreach ($t in @(Get-ChildItem -LiteralPath $skillsDir -Force -Filter '.mh-tmp-*')) { Remove-MhTree $t.FullName }
  foreach ($src in $sources) {
    $name = $src.Name
    $dst = Join-Path $skillsDir $name
    $copy = $true
    if (Test-Path -LiteralPath $dst) {
      $ids = Get-MhTreeIds $dst
      if ($ids -contains $idOf[$name]) {
        $copy = $false
      } elseif (@($ids | Where-Object { $earlier -contains "skill=$name $_" }).Count) {
        Remove-MhSkill $dst
      } elseif ($earlier -contains "skill=$name") {
        $keep = Join-Path (Join-Path $backupRoot 'earlier-harness') $name
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keep) | Out-Null; Move-MhDir $dst $keep
        $older += $name
      } else {
        $keep = Join-Path (Join-Path $backupRoot 'skills') $name
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keep) | Out-Null; Move-MhDir $dst $keep
        $backed += $name
      }
    }
    # Recorded before the copy goes in (your folder, if any, is already aside): a copy in place is always listed.
    [IO.File]::AppendAllText($manifest, "skill=$name $($idOf[$name])" + [Environment]::NewLine, $MhUtf8)
    if ($copy) {
      $tmp = Join-Path $skillsDir ".mh-tmp-$name"
      Copy-Item -LiteralPath $src.FullName -Destination $tmp -Recurse
      Move-Item -LiteralPath $tmp -Destination $dst
    }
    $copied += $name
    Test-Checkpoint 'skill'
  }

  # Skills the earlier install of this agent put there that this version no longer has (removed or renamed):
  # removed while still exactly as installed, moved to backups\<date>\removed\ if you changed them,
  # to backups\<date>\earlier-harness\ if the install was from before 0.5.0. Another agent's copy stays.
  foreach ($line in $oldSkills) {
    $name, $id = $line.Substring(6) -split ' ', 2
    if ($idOf.ContainsKey($name) -or $dropped -contains $name) { continue }
    $dst = Join-Path $skillsDir $name
    if (-not (Test-Path -LiteralPath $dst)) { continue }
    $other = $false
    foreach ($m in Get-Manifests) {
      if ($m.Name -eq (Split-Path -Leaf $manifest)) { continue }   # by name: FullName can spell an 8.3 short name out
      $o = Read-MhManifest $m.FullName
      if ((Test-MhSamePath (Get-MhPath $o 'skills_dir' $base) $skillsDir) -and ($o | Where-Object { $_ -eq "skill=$name" -or $_.StartsWith("skill=$name ") })) { $other = $true }
    }
    if ($other) { Write-Output "  keep $dst (no longer part of the harness, but another installed agent lists it)"; continue }
    $ids = Get-MhTreeIds $dst
    if ($id -and @($ids | Where-Object { $oldSkills -contains "skill=$name $_" }).Count) {
      Remove-MhSkill $dst
    } else {
      $keep = if ($id) { Join-Path (Join-Path $backupRoot 'removed') $name } else { Join-Path (Join-Path $backupRoot 'earlier-harness') $name }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keep) | Out-Null; Move-MhDir $dst $keep
    }
    $dropped += $name
  }
}
Test-Checkpoint 'skills'

# 2. Routing block.
$routing = [IO.File]::ReadAllText((Join-Path $repo 'ROUTING.md'), $MhUtf8) -replace "`r`n", "`n"
$routing = $routing.Replace('`rich-report` (Claude with Artifacts) or `html-report` (any agent)', '`html-report`').TrimEnd("`n")
if ($Scope -eq 'design') {
  # Design work only: drop the rows that route research, installs and general coding.
  $drop = '^\| (Research, analysis|Installing, adding|Any new feature or creative work|Whole-project security review)'
  $routing = (($routing -split "`n") | Where-Object { $_ -notmatch $drop }) -join "`n"
  $routing = $routing.TrimEnd("`n") + "`n`nScope: design work only (installed with -Scope design). For research, installs and general coding, work as you would without this harness."
}
$block = ConvertTo-MhRaw "$MhStart`n$routing`n$MhEnd"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $rules) | Out-Null
$old = if ($rulesIsFile) { Read-MhText $rules } else { $null }
if ($Agent -eq 'cursor') {
  $content = (ConvertTo-MhRaw "---`ndescription: makkov-harness routing - which skill fits which situation`nalwaysApply: true`n---`n") + $block + "`n"
} elseif ($rulesIsFile -and $old.Contains($MhStart)) {
  $content = Get-MhReplacedBlock $rules $block
} elseif ($rulesIsFile -and $old.Length -gt 0) {
  # Appended after one blank line; a file that does not end in a newline gets one first.
  $content = $old; if (-not $content.EndsWith("`n")) { $content += "`n" }
  $content = $content + "`n" + $block + "`n"
} else {
  $content = $block + "`n"
}
if ($rulesIsFile -and $old -ceq $content) {
  # already up to date: the file is not touched
} else {
  if ($needCopy) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $original) | Out-Null
    Copy-MhBytes $rules $original   # a plain copy: not read-only, even if the file is
  }
  Write-MhText $rules $content
}
Test-Checkpoint 'rules'

# 3. The manifest, as it now stands.
$finalBackups = $oldBackups; if ($backed.Count) { $finalBackups += 'backup=' + (Join-Path $backupRoot 'skills') }
Write-Manifest $manifestSkills $finalBackups

Write-Output "makkov-harness installed for $Agent"
if ($skillsDir) { Write-Output ("Skills -> $skillsDir : " + ($copied -join ', ')) }
if ($backed.Count) { Write-Output ("Kept your earlier versions of: " + ($backed -join ', ') + " -> " + (Join-Path $backupRoot 'skills')) }
if ($older.Count) { Write-Output ("Moved the copies an install before 0.5.0 left of: " + ($older -join ', ') + " -> " + (Join-Path $backupRoot 'earlier-harness') + " (delete them if you never edited them)") }
if ($dropped.Count) { Write-Output ("No longer part of the harness, taken out of ${skillsDir}: " + ($dropped -join ', ')) }
Write-Output "Routing -> $rules"
if ($Agent -eq 'aider') { Write-Output "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project." }
Write-Output 'Restart the agent, then run the harness-onboarding skill to personalize it.'

} finally { Exit-MhLock $mhLock }
