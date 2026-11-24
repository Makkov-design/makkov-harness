<#
  Test adapter: install.ps1's parameters, run by the Node installer, so the PowerShell scenario and sequence tests
  drive either implementation ($env:MAKKOV_IMPL = 'node' in install\test\). Not for use outside the tests.
#>
param([string]$Agent, [string]$Project, [switch]$DryRun, [string]$Scope, [switch]$FollowLinks)
$ErrorActionPreference = 'Continue'
$a = @((Join-Path $PSScriptRoot '..\..\..\bin\makkov-harness.mjs'), 'install', '--agent', $Agent)
if ($Project) { $a += @('--project', $Project) }
if ($DryRun) { $a += '--dry-run' }
if ($FollowLinks) { $a += '--follow-links' }
if ($PSBoundParameters.ContainsKey('Scope')) { $a += @('--scope', $Scope) }
# The second the run is in, from Get-Date: a test that replaces Get-Date gets the same second for every run.
$keep = $env:MAKKOV_HARNESS_TEST_STAMP
$env:MAKKOV_HARNESS_TEST_STAMP = Get-Date -Format 'yyyyMMdd-HHmmss'
try { & node @a } finally { $env:MAKKOV_HARNESS_TEST_STAMP = $keep }
exit $LASTEXITCODE
