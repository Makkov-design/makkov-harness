<#
  Test adapter: uninstall.ps1's parameters, run by the Node installer (see install.ps1 next to this file).
#>
param([string]$Agent, [string]$Project, [switch]$DryRun, [switch]$FollowLinks)
$ErrorActionPreference = 'Continue'
$a = @((Join-Path $PSScriptRoot '..\..\..\cli\makkov-harness.mjs'), 'uninstall', '--agent', $Agent)
if ($Project) { $a += @('--project', $Project) }
if ($DryRun) { $a += '--dry-run' }
if ($FollowLinks) { $a += '--follow-links' }
$keep = $env:MAKKOV_HARNESS_TEST_STAMP
$env:MAKKOV_HARNESS_TEST_STAMP = Get-Date -Format 'yyyyMMdd-HHmmss'
try { & node @a } finally { $env:MAKKOV_HARNESS_TEST_STAMP = $keep }
exit $LASTEXITCODE
