<#
  Random sequences of install, update and uninstall, for several agents at once, with interruptions (the twin of
  install/test/test-sequences.sh). After everything is uninstalled, the folder must be exactly as it was at the
  start (every file, byte for byte, and no folder added or removed), and nothing outside it may have changed.
  Seeded, so a failure can be re-run.

  Usage: powershell -File install\test\test-sequences.ps1 [-Runs 20] [-Seed 1]
#>
param([int]$Runs = 20, [int]$Seed = 1)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$inst = Join-Path $repo 'install\install.ps1'; $uninst = Join-Path $repo 'install\uninstall.ps1'
$rng = New-Object System.Random $Seed
function Pick([object[]]$From) { $From[$rng.Next($From.Count)] }
function New-Temp { $d = Join-Path ([IO.Path]::GetTempPath()) ('mh-' + [guid]::NewGuid().ToString('N').Substring(0, 10)); New-Item -ItemType Directory $d | Out-Null; $d }
# Everything under a folder, with hashes of files.
function Tree([string]$Dir) {
  $root = (Resolve-Path -LiteralPath $Dir).ProviderPath
  (@(Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object {
    $r = $_.FullName.Substring($root.Length)
    if ($_.PSIsContainer) { "$r\" } else { "$r " + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  }) | Sort-Object) -join "`n"
}
function Outside([string]$Parent, [string]$Name) {
  (@(Get-ChildItem -LiteralPath $Parent -Force | Where-Object { $_.Name -ne $Name } | ForEach-Object {
    if ($_.PSIsContainer) { "$($_.Name)\" } else { "$($_.Name) " + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  }) | Sort-Object) -join "`n"
}
# One run of install.ps1 or uninstall.ps1 in this PowerShell; $true when it finished (exit code 0, nothing thrown).
function Invoke-Mh([string]$Script, [hashtable]$ArgMap) {
  $global:LASTEXITCODE = 0
  try { & $Script @ArgMap *> $null } catch { $script:err = "$_"; return $false }
  $script:err = "exit code $global:LASTEXITCODE"; $global:LASTEXITCODE -eq 0
}
$realHome = $env:USERPROFILE

try {
  for ($n = 1; $n -le $Runs; $n++) {
    $parent = New-Temp
    $name = Pick @('plain', 'My Project', 'design [v2]')
    $level = Pick @('project', 'home')
    if ($level -eq 'project') {
      $h = Join-Path $parent 'home'; $base = Join-Path $parent $name; $proj = $base
      $pool = @('codex', 'copilot', 'cline', 'cursor', 'gemini', 'windsurf', 'aider')
    } else {
      $h = Join-Path $parent $name; $base = $h; $proj = ''
      $pool = @('codex', 'cline', 'gemini', 'opencode')
    }
    New-Item -ItemType Directory -Force -Path $h, $base | Out-Null; $env:USERPROFILE = $h
    $agents = @(); while ($agents.Count -lt 3) { $a = Pick $pool; if ($agents -notcontains $a) { $agents += $a } }
    # What the person had before: maybe an AGENTS.md (with or without a final newline, maybe CRLF), maybe a skill
    # of their own with one of the harness's names, maybe a GEMINI.md.
    $rulesDir = if ($level -eq 'home') { Join-Path $h '.codex' } else { $base }
    switch ($rng.Next(4)) {
      0 { New-Item -ItemType Directory -Force $rulesDir | Out-Null; [IO.File]::WriteAllText((Join-Path $rulesDir 'AGENTS.md'), "# my notes`n") }
      1 { New-Item -ItemType Directory -Force $rulesDir | Out-Null; [IO.File]::WriteAllText((Join-Path $rulesDir 'AGENTS.md'), "# my notes`r`nno newline at the end") }
      2 { New-Item -ItemType Directory -Force $rulesDir | Out-Null; [IO.File]::WriteAllText((Join-Path $rulesDir 'AGENTS.md'), "  `n`n") }
    }
    if ($rng.Next(2) -eq 0) { New-Item -ItemType Directory -Force (Join-Path $base '.agents\skills\animate') | Out-Null; [IO.File]::WriteAllText((Join-Path $base '.agents\skills\animate\SKILL.md'), "mine`n") }
    if ($level -eq 'project' -and $rng.Next(3) -eq 0) { [IO.File]::WriteAllText((Join-Path $base 'GEMINI.md'), "gemini notes`n") }
    # Files outside the folder that a split or wildcard path would hit.
    [IO.File]::WriteAllText((Join-Path $parent (($name -split ' ')[0] + 'x')), "outside`n"); [IO.File]::WriteAllText((Join-Path $parent 'My'), "outside`n")
    $start = Tree $base; $outside = Outside $parent $name
    $log = New-Object System.Collections.Generic.List[string]
    $fail = {
      param($Why)
      Write-Output "FAIL (sequence $n, seed $Seed): $Why"; Write-Output 'steps:'; $log | ForEach-Object { Write-Output "  $_" }
      $env:USERPROFILE = $realHome; exit 1
    }
    for ($step = 1; $step -le 8; $step++) {
      $a = Pick $agents
      if (-not $proj -and @('cursor', 'copilot', 'windsurf', 'aider') -contains $a) { continue }
      $op = Pick @('install', 'install', 'update', 'uninstall', 'uninstall')
      $stop = $rng.Next(4) -eq 0
      $am = @{ Agent = $a }; if ($proj) { $am.Project = $proj }
      if ($op -eq 'uninstall') {
        $script_ = $uninst; $points = @('u-skills', 'u-rules')
        if (-not (Test-Path -LiteralPath (Join-Path $base ".makkov-harness\install-$a.txt"))) { continue }
      } else {
        $script_ = $inst; $points = @('skill', 'skills', 'rules')
        if ($op -eq 'update' -and $rng.Next(2) -eq 0) { $am.Scope = 'design' }
      }
      if ($stop) {
        $pt = Pick $points
        $env:MAKKOV_HARNESS_TEST = '1'; $env:MAKKOV_HARNESS_TEST_STOP = $pt
        try { Invoke-Mh $script_ $am | Out-Null } finally { Remove-Item Env:\MAKKOV_HARNESS_TEST, Env:\MAKKOV_HARNESS_TEST_STOP }
        $log.Add("$op $a$(if ($am.Scope) { ' -Scope design' }) (stopped after $pt)")
      } else {
        $ok = Invoke-Mh $script_ $am
        $log.Add("$op $a$(if ($am.Scope) { ' -Scope design' }) (normal)")
        if (-not $ok) { & $fail "step ${step}: $op $a failed: $($script:err)" }
      }
    }
    # Uninstall everything still installed (twice over, in case a manifest hands work on to another).
    foreach ($pass in 1, 2) {
      $st = Join-Path $base '.makkov-harness'
      if (-not (Test-Path -LiteralPath $st)) { break }
      foreach ($m in @(Get-ChildItem -LiteralPath $st -Filter 'install-*.txt' -File)) {
        $a = $m.BaseName.Substring(8)
        $am = @{ Agent = $a }; if ($proj) { $am.Project = $proj }
        if (-not (Invoke-Mh $uninst $am)) { & $fail "final uninstall of $a failed: $($script:err)" }
        $log.Add("uninstall $a (final)")
      }
    }
    $now = Tree $base
    if ($now -ne $start) { & $fail ("the folder is not as it was:`n" + ((Compare-Object ($start -split "`n") ($now -split "`n") | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }) -join "`n")) }
    if ((Outside $parent $name) -ne $outside) { & $fail 'something outside the folder changed' }
    $env:USERPROFILE = $realHome
    Remove-Item -LiteralPath $parent -Recurse -Force
  }
} finally { $env:USERPROFILE = $realHome }
Write-Output "installer sequences: $Runs passed (seed $Seed)"
exit 0
