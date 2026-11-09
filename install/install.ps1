<#
  makkov-harness installer for agents other than Claude (Windows PowerShell 5.1+ / PowerShell 7).
  Copies skills/ into the folder the agent reads and puts ROUTING.md into the agent's instructions
  file inside a marked block. Copies local files only; downloads nothing.

  Usage: install.ps1 -Agent codex|cursor|gemini|copilot|windsurf|cline|opencode|aider [-Project <path>]
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider')]
  [string]$Agent,
  [string]$Project
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

# A fingerprint of a folder: every file's relative path and SHA-256.
function Get-TreeFingerprint([string]$Dir) {
  $root = (Resolve-Path $Dir).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
  (Get-ChildItem $root -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
    $_.FullName.Substring($root.Length) + ':' + (Get-FileHash $_.FullName -Algorithm SHA256).Hash
  }) -join "`n"
}

# 1. Skills (rich-report needs Claude Artifacts, so it is skipped here).
# A folder with the same name that is not an identical copy of ours (your own skill, or one you
# edited) is moved to the backup folder first, never deleted.
$copied = @(); $backed = @()
if ($skillsDir) {
  New-Item -ItemType Directory -Force $skillsDir | Out-Null
  Get-ChildItem (Join-Path $repo 'skills') -Directory | Where-Object { $_.Name -ne 'rich-report' } | ForEach-Object {
    $dst = Join-Path $skillsDir $_.Name
    if (Test-Path $dst) {
      if ((Get-TreeFingerprint $_.FullName) -eq (Get-TreeFingerprint $dst)) { Remove-Item $dst -Recurse -Force }
      else {
        New-Item -ItemType Directory -Force (Join-Path $backupRoot 'skills') | Out-Null
        Move-Item $dst (Join-Path (Join-Path $backupRoot 'skills') $_.Name)
        $backed += $_.Name
      }
    }
    Copy-Item $_.FullName $dst -Recurse
    $copied += $_.Name
  }
}

# 2. Routing block.
$routing = Get-Content (Join-Path $repo 'ROUTING.md') -Raw -Encoding UTF8
$routing = $routing.Replace('`rich-report` (Claude with Artifacts) or `html-report` (any agent)', '`html-report`')
$block = "<!-- makkov-harness:start -->`n$routing`n<!-- makkov-harness:end -->"
$utf8 = New-Object System.Text.UTF8Encoding $false
New-Item -ItemType Directory -Force (Split-Path -Parent $rules) | Out-Null
# Every instructions file it is about to change, the Cursor rule included, gets a dated copy first.
if (Test-Path $rules) { Copy-Item $rules "$rules.bak-$stamp" }
if ($Agent -eq 'cursor') {
  $content = "---`ndescription: makkov-harness routing - which skill fits which situation`nalwaysApply: true`n---`n$block`n"
} elseif (Test-Path $rules) {
  $old = [IO.File]::ReadAllText($rules)
  $pattern = '(?s)<!-- makkov-harness:start -->.*?<!-- makkov-harness:end -->'
  if ($old -match $pattern) { $content = [regex]::Replace($old, $pattern, { param($m) $block }) }
  else { $content = $old.TrimEnd() + "`n`n" + $block + "`n" }
} else {
  $content = $block + "`n"
}
[IO.File]::WriteAllText($rules, $content, $utf8)

Write-Output "makkov-harness installed for $Agent"
if ($skillsDir) { Write-Output ("Skills -> $skillsDir : " + ($copied -join ', ')) }
if ($backed.Count) { Write-Output ("Kept your earlier versions of: " + ($backed -join ', ') + " -> " + (Join-Path $backupRoot 'skills')) }
Write-Output "Routing -> $rules"
if ($Agent -eq 'aider') { Write-Output "Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project." }
Write-Output 'Restart the agent, then run the harness-onboarding skill to personalize it.'
