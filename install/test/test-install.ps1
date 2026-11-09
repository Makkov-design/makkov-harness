<#
  End-to-end test of install.ps1 and uninstall.ps1 for every agent, in throwaway homes and projects.
  Works in Windows PowerShell 5.1 and PowerShell 7: powershell -File install\test\test-install.ps1
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$inst = Join-Path $repo 'install\install.ps1'; $uninst = Join-Path $repo 'install\uninstall.ps1'
$expected = @(Get-ChildItem (Join-Path $repo 'skills') -Directory | Where-Object { $_.Name -ne 'rich-report' }).Count
$script:fails = 0
function Check([string]$Name, [scriptblock]$Test) {
  $r = $false; try { $r = [bool](& $Test) } catch { $r = $false }
  if ($r) { Write-Output "  ok   $Name" } else { Write-Output "  FAIL $Name"; $script:fails++ }
}
function Markers([string]$File) { if (Test-Path $File) { ([regex]::Matches([IO.File]::ReadAllText($File), '<!-- makkov-harness:start -->')).Count } else { 0 } }
function New-Temp { $d = Join-Path ([IO.Path]::GetTempPath()) ('mh-' + [guid]::NewGuid().ToString('N').Substring(0, 10)); New-Item -ItemType Directory $d | Out-Null; $d }
$realHome = $env:USERPROFILE

function Run-Agent([string]$Agent, [string]$Scope) {
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  $pArgs = @{ Agent = $Agent }; if ($Scope -eq 'project') { $pArgs.Project = $proj }
  $base = if ($Scope -eq 'project') { $proj } else { $h }
  $skills = switch ($Agent) { 'cline' { Join-Path $base '.cline\skills' } 'aider' { $null } default { Join-Path $base '.agents\skills' } }
  $rules = switch ("${Agent}:$Scope") {
    'codex:home' { Join-Path $h '.codex\AGENTS.md' } 'gemini:home' { Join-Path $h '.gemini\GEMINI.md' }
    'opencode:home' { Join-Path $h '.config\opencode\AGENTS.md' } 'cline:home' { Join-Path $h '.agents\AGENTS.md' }
    'gemini:project' { Join-Path $proj 'GEMINI.md' } 'cursor:project' { Join-Path $proj '.cursor\rules\makkov-harness.mdc' }
    'aider:project' { Join-Path $proj 'CONVENTIONS.md' } default { Join-Path $proj 'AGENTS.md' }
  }
  Write-Output "$Agent ($Scope)"
  & $inst @pArgs -DryRun | Out-Null
  Check 'dry run writes nothing' { @(Get-ChildItem $h, $proj -Recurse -File -Force).Count -eq 0 }
  if ($skills) { New-Item -ItemType Directory -Force (Join-Path $skills 'animate') | Out-Null; Set-Content (Join-Path $skills 'animate\SKILL.md') 'mine' }

  & $inst @pArgs | Out-Null
  if ($skills) {
    Check "all $expected skills copied" { @(Get-ChildItem $skills -Directory).Count -eq $expected }
    Check 'your animate moved to the backup folder' { (Get-Content (Get-ChildItem (Join-Path $base '.makkov-harness\backups') -Recurse -Filter SKILL.md | Where-Object { $_.Directory.Name -eq 'animate' } | Select-Object -First 1).FullName) -eq 'mine' }
    Check 'rich-report skipped' { -not (Test-Path (Join-Path $skills 'rich-report')) }
  }
  Check 'routing block written once' { (Markers $rules) -eq 1 }
  Check 'manifest written' { Test-Path (Join-Path $base ".makkov-harness\install-$Agent.txt") }

  Start-Sleep -Milliseconds 1100
  & $inst @pArgs | Out-Null
  Check 'second run keeps one routing block' { (Markers $rules) -eq 1 }
  Check 'second run makes no new skill backup' { @(Get-ChildItem (Join-Path $base '.makkov-harness\backups') -Directory -ErrorAction SilentlyContinue).Count -le 1 }

  & $uninst @pArgs | Out-Null
  if ($skills) {
    Check 'our skills removed' { -not (Test-Path (Join-Path $skills 'design-score')) }
    Check 'your animate restored' { (Get-Content (Join-Path $skills 'animate\SKILL.md')) -eq 'mine' }
  }
  if ($Agent -eq 'cursor') { Check 'Cursor rule removed' { -not (Test-Path $rules) } }
  else { Check 'routing block removed' { (Markers $rules) -eq 0 } }
  Check 'manifest removed' { -not (Test-Path (Join-Path $base ".makkov-harness\install-$Agent.txt")) }
  $env:USERPROFILE = $realHome
  Remove-Item $h, $proj -Recurse -Force
}

try {
  foreach ($a in 'codex', 'gemini', 'opencode', 'cline') { Run-Agent $a 'home' }
  foreach ($a in 'codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider') { Run-Agent $a 'project' }

  $h = New-Temp; $env:USERPROFILE = $h
  New-Item -ItemType Directory (Join-Path $h '.codex') | Out-Null; Set-Content (Join-Path $h '.codex\AGENTS.md') '# my notes'
  Write-Output 'codex with your own AGENTS.md'
  & $inst -Agent codex | Out-Null
  Check 'a dated backup of your file' { @(Get-ChildItem (Join-Path $h '.codex') -Filter 'AGENTS.md.bak-*').Count -ge 1 }
  & $uninst -Agent codex | Out-Null
  Check 'your notes kept, block gone' { ((Get-Content (Join-Path $h '.codex\AGENTS.md')) -contains '# my notes') -and ((Markers (Join-Path $h '.codex\AGENTS.md')) -eq 0) }
  $env:USERPROFILE = $realHome; Remove-Item $h -Recurse -Force

  $h = New-Temp; $parent = New-Temp; $proj = Join-Path $parent 'My Project'; $env:USERPROFILE = $h
  New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills\animate') | Out-Null
  Set-Content (Join-Path $proj '.agents\skills\animate\SKILL.md') 'mine'
  Write-Output 'codex, project path with spaces'
  & $inst -Agent codex -Project $proj | Out-Null
  Check 'installed into the spaced path' { Test-Path (Join-Path $proj '.agents\skills\design-score\SKILL.md') }
  & $uninst -Agent codex -Project $proj | Out-Null
  Check 'your animate restored from the spaced path' { (Get-Content (Join-Path $proj '.agents\skills\animate\SKILL.md')) -eq 'mine' }
  Check 'our skills removed from the spaced path' { -not (Test-Path (Join-Path $proj '.agents\skills\design-score')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $parent -Recurse -Force

  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, -Scope design'
  & $inst -Agent codex -Project $proj -Scope design | Out-Null
  $agents = Get-Content (Join-Path $proj 'AGENTS.md')
  Check 'research and install rows dropped' { -not ($agents | Where-Object { $_ -match '^\| (Research, analysis|Installing, adding)' }) }
  Check 'design rows kept' { [bool]($agents | Where-Object { $_ -like '| A design score*' }) }
  Check 'the block says it is design-only' { [bool]($agents | Where-Object { $_ -like 'Scope: design work only*' }) }
  & $uninst -Agent codex -Project $proj | Out-Null
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force
} finally { $env:USERPROFILE = $realHome }

Write-Output ''
if ($script:fails -eq 0) { Write-Output 'installer tests: all passed' } else { Write-Output "installer tests: $($script:fails) failed"; exit 1 }
