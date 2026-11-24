<#
  makkov-harness installer for agents other than Claude (Windows PowerShell 5.1+ / PowerShell 7).
  Copies skills/ into the folder the agent reads and puts ROUTING.md into the agent's instructions
  file inside a marked block. Copies local files only; downloads nothing.

  Usage: install.ps1 -Agent codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [-Project <path>] [-DryRun] [-Scope all|design]
    -DryRun          print every change it would make and write nothing
    -Scope design    route design work only: research reports, third-party installs and general coding
                     plugins are left out of the routing map (the skills are still copied)
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider')]
  [string]$Agent,
  [string]$Project,
  [switch]$DryRun,
  [ValidateSet('all', 'design')]
  [string]$Scope = 'all'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$home_ = $env:USERPROFILE
if ($Project) { $Project = (Resolve-Path $Project).Path }

$projectOnly = @('cursor', 'copilot', 'windsurf', 'aider')
if (($projectOnly -contains $Agent) -and -not $Project) {
  Write-Error "$Agent has no user-level instructions file this installer can edit. Pass -Project <path>."
}

function Base { if ($Project) { $Project } else { $home_ } }

switch ($Agent) {
  'cline'  { $skillsDir = if ($Project) { Join-Path $Project '.cline\skills' } else { Join-Path $home_ '.cline\skills' } }
  'aider'  { $skillsDir = $null }
  default  { $skillsDir = Join-Path (Base) '.agents\skills' }
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
$backupRoot = Join-Path (Join-Path (Join-Path (Base) '.makkov-harness') 'backups') $stamp
if ($DryRun) { Write-Output 'Dry run: nothing will be written.' }

# A fingerprint of a folder: every file's relative path and SHA-256.
function Get-TreeFingerprint([string]$Dir) {
  $root = (Resolve-Path $Dir).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
  (Get-ChildItem $root -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
    $_.FullName.Substring($root.Length) + ':' + (Get-FileHash $_.FullName -Algorithm SHA256).Hash
  }) -join "`n"
}

# A short id of a fingerprint, as recorded in the manifest.
function Get-TreeId([string]$Dir) {
  $bytes = [Text.Encoding]::UTF8.GetBytes((Get-TreeFingerprint $Dir))
  $sha = [Security.Cryptography.SHA256]::Create()
  (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}

# What earlier installs into this skills folder put there, from every manifest that points at it.
$stateDir = Join-Path (Base) '.makkov-harness'
$earlier = @()
if ($skillsDir -and (Test-Path $stateDir)) {
  foreach ($m in Get-ChildItem $stateDir -Filter 'install-*.txt') {
    $o = @(Get-Content $m.FullName -Encoding UTF8)
    if ((($o | Where-Object { $_ -like 'skills_dir=*' } | Select-Object -First 1) -replace '^skills_dir=', '') -eq $skillsDir) {
      $earlier += @($o | Where-Object { $_ -like 'skill=*' })
    }
  }
}

# 1. Skills (rich-report needs Claude Artifacts, so it is skipped here).
# - an identical copy of ours, or the copy an earlier install of this harness put there, is replaced;
# - a folder an install from before 0.5.0 put there (no fingerprint recorded, so it may have been edited) is
#   moved to backups\<date>\earlier-harness\ and left there;
# - anything else (your own skill, or ours that you edited) is moved to backups\<date>\skills\ and put back
#   by the uninstaller. Nothing is deleted that might be yours.
$copied = @(); $backed = @(); $older = @(); $manifestSkills = @()
if ($skillsDir) {
  if (-not $DryRun) { New-Item -ItemType Directory -Force $skillsDir | Out-Null }
  Get-ChildItem (Join-Path $repo 'skills') -Directory | Where-Object { $_.Name -ne 'rich-report' } | ForEach-Object {
    $name = $_.Name
    $dst = Join-Path $skillsDir $name
    $idNew = Get-TreeId $_.FullName
    if (Test-Path $dst) {
      $idOld = Get-TreeId $dst
      if ($idOld -eq $idNew -or ($earlier -contains "skill=$name $idOld")) {
        if ($DryRun) { Write-Output "  would update $dst (a copy this harness put there)" } else { Remove-Item $dst -Recurse -Force }
      } elseif ($earlier -contains "skill=$name") {
        $keep = Join-Path (Join-Path $backupRoot 'earlier-harness') $name
        if ($DryRun) { Write-Output "  would move $dst (from an install before 0.5.0) to $keep" }
        else { New-Item -ItemType Directory -Force (Split-Path -Parent $keep) | Out-Null; Move-Item $dst $keep }
        $older += $name
      } else {
        $keep = Join-Path (Join-Path $backupRoot 'skills') $name
        if ($DryRun) { Write-Output "  would move your $dst to $keep, then copy ours" }
        else { New-Item -ItemType Directory -Force (Split-Path -Parent $keep) | Out-Null; Move-Item $dst $keep }
        $backed += $name
      }
    } elseif ($DryRun) { Write-Output "  would copy $name to $dst" }
    if (-not $DryRun) { Copy-Item $_.FullName $dst -Recurse }
    $copied += $name
    $manifestSkills += "skill=$name $idNew"
  }
}

# 2. Routing block.
$routing = Get-Content (Join-Path $repo 'ROUTING.md') -Raw -Encoding UTF8
$routing = $routing.Replace('`rich-report` (Claude with Artifacts) or `html-report` (any agent)', '`html-report`')
if ($Scope -eq 'design') {
  # Design work only: drop the rows that route research, installs and general coding.
  $drop = '^\| (Research, analysis|Installing, adding|Any new feature or creative work|Whole-project security review)'
  $routing = (($routing -split "`r?`n") | Where-Object { $_ -notmatch $drop }) -join "`n"
  $routing = $routing.TrimEnd() + "`n`nScope: design work only (installed with -Scope design). For research, installs and general coding, work as you would without this harness."
}
$block = "<!-- makkov-harness:start -->`n$routing`n<!-- makkov-harness:end -->"
$pattern = '(?s)<!-- makkov-harness:start -->.*?<!-- makkov-harness:end -->'
if ($DryRun) {
  if (Test-Path $rules) {
    Write-Output "  would back up $rules to $rules.bak-$stamp"
    if ($Agent -eq 'cursor') { Write-Output "  would rewrite $rules with the routing rule" }
    elseif ([IO.File]::ReadAllText($rules) -match $pattern) { Write-Output "  would update the marked routing block in $rules" }
    else { Write-Output "  would append the marked routing block to $rules" }
  } else { Write-Output "  would create $rules with the routing block" }
  Write-Output "Dry run done for $Agent. Run again without -DryRun to install."
  return
}
$utf8 = New-Object System.Text.UTF8Encoding $false
New-Item -ItemType Directory -Force (Split-Path -Parent $rules) | Out-Null
# Every instructions file it is about to change, the Cursor rule included, gets a dated copy first.
# The uninstaller needs to know whether the file was yours before the first install.
$state = Join-Path (Base) '.makkov-harness'
$manifest = Join-Path $state "install-$Agent.txt"
$rulesExisted = '0'; $rulesBackup = ''
if (Test-Path $manifest) {
  $prev = Get-Content $manifest -Encoding UTF8
  $rulesExisted = (($prev | Where-Object { $_ -like 'rules_existed=*' }) -replace '^rules_existed=', '')
  $rulesBackup = (($prev | Where-Object { $_ -like 'rules_backup=*' }) -replace '^rules_backup=', '')
} elseif ((Test-Path $rules) -and -not ([IO.File]::ReadAllText($rules) -match $pattern)) {
  $rulesExisted = '1'; $rulesBackup = "$rules.bak-$stamp"
}
if (Test-Path $rules) { Copy-Item $rules "$rules.bak-$stamp" }
if ($Agent -eq 'cursor') {
  $content = "---`ndescription: makkov-harness routing - which skill fits which situation`nalwaysApply: true`n---`n$block`n"
} elseif (Test-Path $rules) {
  $old = [IO.File]::ReadAllText($rules)
  if ($old -match $pattern) { $content = [regex]::Replace($old, $pattern, { param($m) $block }) }
  else { $content = $old.TrimEnd() + "`n`n" + $block + "`n" }
} else {
  $content = $block + "`n"
}
[IO.File]::WriteAllText($rules, $content, $utf8)

# 3. Manifest: what this install put where, so install/uninstall.ps1 removes exactly that.
New-Item -ItemType Directory -Force $state | Out-Null
$oldBackups = @(); if (Test-Path $manifest) { $oldBackups = @(Get-Content $manifest -Encoding UTF8 | Where-Object { $_ -like 'backup=*' }) }
$lines = @("agent=$Agent", "installed=$stamp", "skills_dir=$skillsDir", "rules=$rules", "rules_existed=$rulesExisted", "rules_backup=$rulesBackup", "scope=$Scope") + $oldBackups
if ($backed.Count) { $lines += "backup=" + (Join-Path $backupRoot 'skills') }
$lines += $manifestSkills
[IO.File]::WriteAllLines($manifest, [string[]]$lines, $utf8)

Write-Output "makkov-harness installed for $Agent"
if ($skillsDir) { Write-Output ("Skills -> $skillsDir : " + ($copied -join ', ')) }
if ($backed.Count) { Write-Output ("Kept your earlier versions of: " + ($backed -join ', ') + " -> " + (Join-Path $backupRoot 'skills')) }
if ($older.Count) { Write-Output ("Moved the copies an install before 0.5.0 left of: " + ($older -join ', ') + " -> " + (Join-Path $backupRoot 'earlier-harness') + " (delete them if you never edited them)") }
Write-Output "Routing -> $rules"
if ($Agent -eq 'aider') { Write-Output "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project." }
Write-Output 'Restart the agent, then run the harness-onboarding skill to personalize it.'
