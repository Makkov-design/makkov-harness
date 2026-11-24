<#
  End-to-end test of install.ps1 and uninstall.ps1, in throwaway homes and projects (never your own).
  Each block states one behaviour the installers promise; install/test/test-install.sh checks the same
  behaviours for install.sh / uninstall.sh.
  Works in Windows PowerShell 5.1 and PowerShell 7: powershell -File install\test\test-install.ps1
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
# $env:MAKKOV_IMPL = 'node' runs every scenario against the Node installer (through install\test\node\, which takes
# the PowerShell installers' parameters); the default is install.ps1 / uninstall.ps1.
if ($env:MAKKOV_IMPL -eq 'node') { $ri = 'install\test\node\install.ps1'; $ru = 'install\test\node\uninstall.ps1' }
else { $ri = 'install\install.ps1'; $ru = 'install\uninstall.ps1' }
$inst = Join-Path $repo $ri; $uninst = Join-Path $repo $ru
$expected = @(Get-ChildItem (Join-Path $repo 'skills') -Directory | Where-Object { $_.Name -ne 'rich-report' }).Count
$script:fails = 0
function Check([string]$Name, [scriptblock]$Test) {
  $r = $false; try { $r = [bool](& $Test) } catch { $r = $false }
  if ($r) { Write-Output "  ok   $Name" } else { Write-Output "  FAIL $Name"; $script:fails++ }
}
function Markers([string]$File) { if (Test-Path -LiteralPath $File) { ([regex]::Matches([IO.File]::ReadAllText($File), '<!-- makkov-harness:start -->')).Count } else { 0 } }
function New-Temp { $d = Join-Path ([IO.Path]::GetTempPath()) ('mh-' + [guid]::NewGuid().ToString('N').Substring(0, 10)); New-Item -ItemType Directory $d | Out-Null; $d }
function Bytes([string]$File) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($File)) }
function Same([string]$A, [string]$B) { (Test-Path -LiteralPath $A) -and (Test-Path -LiteralPath $B) -and ((Bytes $A) -eq (Bytes $B)) }
function Entries([string]$Dir) { @(Get-ChildItem -LiteralPath $Dir -Recurse -Force -ErrorAction SilentlyContinue) }
# Every file under a folder with its hash: two equal snapshots mean nothing changed.
function Snap([string]$Dir) {
  $root = (Resolve-Path -LiteralPath $Dir).Path
  (Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object { $_.FullName -notlike '*\.makkov-harness\install-*' } | Sort-Object FullName |
    ForEach-Object { $_.FullName.Substring($root.Length) + ' ' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join "`n"
}
# A copy of the harness to edit (a newer version of a skill, a skill renamed upstream) without touching this one.
function New-HarnessCopy { $d = New-Temp; Copy-Item (Join-Path $repo 'install'), (Join-Path $repo 'skills'), (Join-Path $repo 'ROUTING.md'), (Join-Path $repo 'bin'), (Join-Path $repo 'package.json') $d -Recurse; $d }
$realHome = $env:USERPROFILE
# This same PowerShell (5.1 or 7), as a child process: to see an exit code and what went to stderr.
$exe = (Get-Process -Id $PID).Path

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
  Check 'dry run writes nothing' { (Entries $h).Count -eq 0 -and (Entries $proj).Count -eq 0 }
  if ($skills) { New-Item -ItemType Directory -Force (Join-Path $skills 'animate') | Out-Null; Set-Content (Join-Path $skills 'animate\SKILL.md') 'mine' }

  & $inst @pArgs | Out-Null
  if ($skills) {
    Check "all $expected skills copied" { @(Get-ChildItem $skills -Directory).Count -eq $expected }
    Check 'your animate moved to the backup folder' { (Get-Content (Get-ChildItem (Join-Path $base '.makkov-harness\backups') -Recurse -Filter SKILL.md | Where-Object { $_.Directory.Name -eq 'animate' } | Select-Object -First 1).FullName) -eq 'mine' }
    Check 'rich-report skipped' { -not (Test-Path (Join-Path $skills 'rich-report')) }
  }
  Check 'routing block written once' { (Markers $rules) -eq 1 }
  Check 'manifest written' { Test-Path (Join-Path $base ".makkov-harness\install-$Agent.txt") }

  $before = Snap $base
  & $inst @pArgs -DryRun | Out-Null
  Check 'dry run of an update writes nothing' { (Snap $base) -eq $before }
  Start-Sleep -Milliseconds 1100
  & $inst @pArgs | Out-Null
  Check 'second run keeps one routing block' { (Markers $rules) -eq 1 }
  Check 'second run changes no file and makes no backup' { (Snap $base) -eq $before }

  & $uninst @pArgs | Out-Null
  if ($skills) {
    Check 'our skills removed' { -not (Test-Path (Join-Path $skills 'design-score')) }
    Check 'your animate restored' { (Get-Content (Join-Path $skills 'animate\SKILL.md')) -eq 'mine' }
    Remove-Item (Join-Path $skills 'animate') -Recurse -Force
    foreach ($d in $skills, (Split-Path -Parent $skills)) { if ((Test-Path $d) -and -not (Entries $d).Count) { Remove-Item $d -Force } }
  }
  if ($Agent -eq 'cursor') { Check 'Cursor rule removed' { -not (Test-Path $rules) } }
  else { Check 'routing block removed' { (Markers $rules) -eq 0 } }
  Check 'manifest removed' { -not (Test-Path (Join-Path $base ".makkov-harness\install-$Agent.txt")) }
  Check 'nothing else left behind' { (Entries $h).Count -eq 0 -and (Entries $proj).Count -eq 0 }
  $env:USERPROFILE = $realHome
  Remove-Item $h, $proj -Recurse -Force
}

try {
  foreach ($a in 'codex', 'gemini', 'opencode', 'cline') { Run-Agent $a 'home' }
  foreach ($a in 'codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider') { Run-Agent $a 'project' }

  # Your own instructions file: kept once as it was before the first install, and put back byte for byte by
  # the uninstall, also after several updates and when it does not end in a newline. No *.bak files next to it.
  foreach ($ending in 'newline', 'none') {
    $h = New-Temp; $env:USERPROFILE = $h; New-Item -ItemType Directory (Join-Path $h '.codex') | Out-Null
    $mine = Join-Path $h '.codex\AGENTS.md'; $exp = Join-Path $h 'expected'
    if ($ending -eq 'newline') { [IO.File]::WriteAllText($mine, "# my notes`n`nmore`n") } else { [IO.File]::WriteAllText($mine, '# my notes') }
    Copy-Item $mine $exp
    Write-Output "codex with your own AGENTS.md (ending: $ending), three installs and an uninstall"
    & $inst -Agent codex | Out-Null
    Check 'a copy of your file as it was' { Same $exp (Join-Path $h '.makkov-harness\backups\original\.codex\AGENTS.md') }
    Start-Sleep -Milliseconds 1100; & $inst -Agent codex | Out-Null; Start-Sleep -Milliseconds 1100; & $inst -Agent codex | Out-Null
    Check 'no *.bak files next to your file' { @(Get-ChildItem (Join-Path $h '.codex') -Force).Count -eq 1 }
    Check 'the block sits after one blank line' { $l = [IO.File]::ReadAllText($mine) -split "`n"; $i = [array]::IndexOf($l, '<!-- makkov-harness:start -->'); $i -gt 0 -and $l[$i - 1] -eq '' }
    & $uninst -Agent codex | Out-Null
    Check 'your file put back byte for byte' { Same $exp $mine }
    Remove-Item $exp
    Check 'nothing else left behind' { (Entries $h).Count -eq 2 }
    $env:USERPROFILE = $realHome; Remove-Item $h -Recurse -Force
  }
  # Edited since the install: your edits stay, only the harness's lines go.
  $h = New-Temp; $env:USERPROFILE = $h; New-Item -ItemType Directory (Join-Path $h '.codex') | Out-Null
  $mine = Join-Path $h '.codex\AGENTS.md'; [IO.File]::WriteAllText($mine, "# my notes`n")
  Write-Output 'codex with your own AGENTS.md, edited after the install'
  & $inst -Agent codex | Out-Null
  [IO.File]::AppendAllText($mine, "# added later`n")
  & $uninst -Agent codex | Out-Null
  Check 'your notes and your later edit kept, block and the blank line before it gone' { [IO.File]::ReadAllText($mine) -eq "# my notes`n# added later`n" }
  Check 'the copy of your file as it was stays (it differs from the file now)' { [IO.File]::ReadAllText((Join-Path $h '.makkov-harness\backups\original\.codex\AGENTS.md')) -eq "# my notes`n" }
  $env:USERPROFILE = $realHome; Remove-Item $h -Recurse -Force

  # Two agents in one project share <project>\AGENTS.md and .agents\skills: uninstalling one leaves the other
  # working (its routing block, its personal layer, its skills); the last uninstall puts your file back.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex and copilot in one project, uninstalled one at a time'
  $agentsMd = Join-Path $proj 'AGENTS.md'; $exp = Join-Path $h 'expected'
  [IO.File]::WriteAllText($agentsMd, "# my notes`n"); Copy-Item $agentsMd $exp
  & $inst -Agent codex -Project $proj | Out-Null; & $inst -Agent copilot -Project $proj | Out-Null
  Check 'one routing block for both' { (Markers $agentsMd) -eq 1 }
  [IO.File]::AppendAllText($agentsMd, "`n<!-- makkov-harness:personal:start -->`n- Answer in English.`n<!-- makkov-harness:personal:end -->`n")
  & $uninst -Agent codex -Project $proj | Out-Null
  Check 'copilot keeps its routing block' { (Markers $agentsMd) -eq 1 }
  Check 'copilot keeps the personal layer' { (Get-Content $agentsMd) -contains '- Answer in English.' }
  Check 'copilot keeps its skills' { Test-Path (Join-Path $proj '.agents\skills\design-score\SKILL.md') }
  Check "copilot's manifest stays" { Test-Path (Join-Path $proj '.makkov-harness\install-copilot.txt') }
  & $uninst -Agent copilot -Project $proj | Out-Null
  Check 'the last uninstall takes the block out' { (Markers $agentsMd) -eq 0 }
  Check 'and puts your file back byte for byte' { Same $exp $agentsMd }
  Check 'the personal layer is kept aside' { (Get-Content (Get-ChildItem (Join-Path $proj '.makkov-harness\backups') -Recurse -Filter 'personal-layer.md' | Select-Object -First 1).FullName) -contains '- Answer in English.' }
  Check 'no skills folder left' { -not (Test-Path (Join-Path $proj '.agents')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # An update keeps the scope of the earlier install unless -Scope is passed again.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, -Scope design, then updates'
  $agentsMd = Join-Path $proj 'AGENTS.md'
  & $inst -Agent codex -Project $proj -Scope design | Out-Null
  $agents = Get-Content $agentsMd
  Check 'research and install rows dropped' { -not ($agents | Where-Object { $_ -match '^\| (Research, analysis|Installing, adding)' }) }
  Check 'design rows kept' { [bool]($agents | Where-Object { $_ -like '| A design score*' }) }
  Check 'the block says it is design-only' { [bool]($agents | Where-Object { $_ -like 'Scope: design work only*' }) }
  & $inst -Agent codex -Project $proj | Out-Null
  Check 'an update without -Scope stays design-only' { [bool]((Get-Content $agentsMd) | Where-Object { $_ -like 'Scope: design work only*' }) -and ((Get-Content (Join-Path $proj '.makkov-harness\install-codex.txt')) -contains 'scope=design') }
  & $inst -Agent codex -Project $proj -Scope all | Out-Null
  Check '-Scope all widens it again' { -not ((Get-Content $agentsMd) | Where-Object { $_ -like 'Scope: design work only*' }) -and [bool]((Get-Content $agentsMd) | Where-Object { $_ -like '| Research, analysis*' }) }
  & $uninst -Agent codex -Project $proj | Out-Null
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # An instructions file that is a symlink stays a symlink through install, update and uninstall
  # (needs the right to create symlinks: an administrator, or Developer Mode; skipped otherwise).
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, AGENTS.md is a symlink'
  New-Item -ItemType Directory (Join-Path $proj 'shared') | Out-Null
  $target = Join-Path $proj 'shared\notes.md'; [IO.File]::WriteAllText($target, "# shared notes`n"); $exp = Join-Path $h 'expected'; Copy-Item $target $exp
  $link = Join-Path $proj 'AGENTS.md'; $linked = $true
  try { New-Item -ItemType SymbolicLink -Path $link -Target $target | Out-Null } catch { $linked = $false; Write-Output '  skip (no right to create symlinks here)' }
  if ($linked) {
    & $inst -Agent codex -Project $proj | Out-Null
    Check 'a copy of the file the link points to, as it was' { Same $exp (Join-Path $proj '.makkov-harness\backups\original\AGENTS.md') }
    Check 'your notes are still in the file after the install' { (Get-Content $target) -contains '# shared notes' }
    Check 'still a symlink after the install' { ((Get-Item $link -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -and (Markers $target) -eq 1 }
    & $inst -Agent codex -Project $proj -Scope design | Out-Null
    Check 'still a symlink after an update that rewrites the block' { ((Get-Item $link -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -and [bool]((Get-Content $target) | Where-Object { $_ -like 'Scope: design*' }) }
    & $uninst -Agent codex -Project $proj | Out-Null
    Check 'still a symlink after the uninstall' { (Get-Item $link -Force).Attributes -band [IO.FileAttributes]::ReparsePoint }
    Check 'the file back as it was after the uninstall' { Same $exp $target }
  }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # Markers that are not paired: nothing is changed, and the reason is printed.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a start marker with no end marker'
  $agentsMd = Join-Path $proj 'AGENTS.md'; $exp = Join-Path $h 'expected'
  [IO.File]::WriteAllText($agentsMd, "# a`n<!-- makkov-harness:start -->`nold routing`n# keep me`n"); Copy-Item $agentsMd $exp
  # Windows PowerShell 5.1 turns a child's stderr into errors, which 'Stop' would throw.
  $ErrorActionPreference = 'Continue'
  # Each line as plain text: Out-String would wrap a long error record across lines.
  $out = (& $exe -NoProfile -ExecutionPolicy Bypass -File $inst -Agent codex -Project $proj 2>&1 | ForEach-Object { "$_" }) -join ' '; $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Check 'install stops with exit code 1' { $code -eq 1 }
  Check 'and says the markers are not paired' { $out -match 'not paired' }
  Check 'your file unchanged' { Same $exp $agentsMd }
  Check 'no skills copied, no manifest' { -not (Test-Path (Join-Path $proj '.agents')) -and -not (Test-Path (Join-Path $proj '.makkov-harness')) }
  [IO.File]::WriteAllText($agentsMd, "# a`n"); & $inst -Agent codex -Project $proj | Out-Null
  [IO.File]::AppendAllText($agentsMd, "<!-- makkov-harness:personal:start -->`n- mine`n"); Copy-Item $agentsMd $exp -Force
  $ErrorActionPreference = 'Continue'
  & $exe -NoProfile -ExecutionPolicy Bypass -File $uninst -Agent codex -Project $proj 2>&1 | Out-Null; $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Check 'uninstall with an unpaired personal marker stops with exit code 1' { $code -eq 1 }
  Check 'and changes nothing' { (Same $exp $agentsMd) -and (Test-Path (Join-Path $proj '.makkov-harness\install-codex.txt')) -and (Test-Path (Join-Path $proj '.agents\skills\design-score')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A project folder moved or renamed after the install: update and uninstall still find what the install put there.
  $h = New-Temp; $parent = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, folder renamed after the install'
  $p1 = Join-Path $parent 'old'; New-Item -ItemType Directory -Force (Join-Path $p1 '.agents\skills\animate') | Out-Null
  Set-Content (Join-Path $p1 '.agents\skills\animate\SKILL.md') 'mine'
  [IO.File]::WriteAllText((Join-Path $p1 'AGENTS.md'), "# my notes`n"); $exp = Join-Path $h 'expected'; Copy-Item (Join-Path $p1 'AGENTS.md') $exp
  & $inst -Agent codex -Project $p1 | Out-Null
  $p2 = Join-Path $parent 'new'; Move-Item $p1 $p2
  & $inst -Agent codex -Project $p2 | Out-Null
  Check 'the update recognises our skills (no new backup)' { @(Get-ChildItem (Join-Path $p2 '.makkov-harness\backups') -Directory | Where-Object { $_.Name -ne 'original' }).Count -eq 1 }
  Check 'the manifest now names the new folder' { (Get-Content (Join-Path $p2 '.makkov-harness\install-codex.txt')) -contains "base=$p2" }
  $p3 = Join-Path $parent 'newer'; Move-Item $p2 $p3
  & $uninst -Agent codex -Project $p3 | Out-Null
  Check 'skills removed' { -not (Test-Path (Join-Path $p3 '.agents\skills\design-score')) }
  Check 'your animate restored' { (Get-Content (Join-Path $p3 '.agents\skills\animate\SKILL.md')) -eq 'mine' }
  Check 'routing block removed, your file back' { Same $exp (Join-Path $p3 'AGENTS.md') }
  Check 'no harness folder left' { -not (Test-Path (Join-Path $p3 '.makkov-harness')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $parent -Recurse -Force

  # A skill removed or renamed in a newer version: the update takes the old copy out (or sets it aside if you
  # changed it), unless another installed agent still lists it.
  $src = New-HarnessCopy; $sInst = Join-Path $src $ri; $sUninst = Join-Path $src $ru
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex and copilot project, skills renamed upstream'
  & $sInst -Agent codex -Project $proj | Out-Null; & $sInst -Agent copilot -Project $proj | Out-Null
  Move-Item (Join-Path $src 'skills\animate') (Join-Path $src 'skills\animate-renamed')
  Move-Item (Join-Path $src 'skills\design-score') (Join-Path $src 'skills\design-score-renamed')
  Add-Content (Join-Path $proj '.agents\skills\design-score\SKILL.md') 'my change'
  & $sInst -Agent codex -Project $proj | Out-Null
  Check 'while copilot still lists them, the old copies stay' { (Test-Path (Join-Path $proj '.agents\skills\animate')) -and (Test-Path (Join-Path $proj '.agents\skills\design-score')) }
  Check 'the renamed skills are copied' { Test-Path (Join-Path $proj '.agents\skills\animate-renamed') }
  & $sInst -Agent copilot -Project $proj | Out-Null
  Check 'the last update takes the unchanged old copy out' { -not (Test-Path (Join-Path $proj '.agents\skills\animate')) }
  Check 'and sets the one you changed aside' { -not (Test-Path (Join-Path $proj '.agents\skills\design-score')) -and [bool](Get-ChildItem (Join-Path $proj '.makkov-harness\backups') -Recurse -Directory | Where-Object { $_.Name -eq 'design-score' -and $_.Parent.Name -eq 'removed' }) }
  Check 'neither is in a manifest any more' { -not (Get-ChildItem (Join-Path $proj '.makkov-harness') -Filter 'install-*.txt' | ForEach-Object { Get-Content $_.FullName } | Where-Object { $_ -like 'skill=animate *' -or $_ -like 'skill=design-score *' }) }
  & $sUninst -Agent codex -Project $proj | Out-Null; & $sUninst -Agent copilot -Project $proj | Out-Null
  Check 'uninstall leaves no skills folder' { -not (Test-Path (Join-Path $proj '.agents')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj, $src -Recurse -Force

  # Updating in place, then uninstalling; and an update over an install from before 0.5.0.
  $src = New-HarnessCopy; $sInst = Join-Path $src $ri; $sUninst = Join-Path $src $ru
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, update in place, then uninstall'
  & $sInst -Agent codex -Project $proj | Out-Null
  Set-Content (Join-Path $src 'skills\animate\CHANGES.md') 'new in this version'
  Start-Sleep -Milliseconds 1100
  & $sInst -Agent codex -Project $proj | Out-Null
  Check 'the update replaced our animate' { Test-Path (Join-Path $proj '.agents\skills\animate\CHANGES.md') }
  Check 'the update made no backup of ours' { @(Get-ChildItem (Join-Path $proj '.makkov-harness\backups') -Recurse -Directory -ErrorAction SilentlyContinue).Count -eq 0 }
  & $sUninst -Agent codex -Project $proj | Out-Null
  Check 'nothing of the harness left after uninstall' { (Entries $proj).Count -eq 0 }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, update over an install from before 0.5.0'
  & $sInst -Agent codex -Project $proj | Out-Null
  $mf = Join-Path $proj '.makkov-harness\install-codex.txt'
  [IO.File]::WriteAllLines($mf, [string[]](Get-Content $mf | Where-Object { $_ -notlike 'base=*' } | ForEach-Object { $_ -replace '^(skill=\S+) .*$', '$1' }))
  Add-Content (Join-Path $src 'skills\animate\CHANGES.md') 'newer still'
  Start-Sleep -Milliseconds 1100
  & $sInst -Agent codex -Project $proj | Out-Null
  Check 'the old copy went to earlier-harness' { @(Get-ChildItem (Join-Path $proj '.makkov-harness\backups') -Recurse -Directory | Where-Object { $_.Name -eq 'animate' -and $_.Parent.Name -eq 'earlier-harness' }).Count -eq 1 }
  Check 'nothing went to the restore list' { -not (Get-Content $mf | Where-Object { $_ -like 'backup=*' }) }
  & $sUninst -Agent codex -Project $proj | Out-Null
  Check 'the uninstall restores no old harness copy' { -not (Test-Path (Join-Path $proj '.agents\skills\animate')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj, $src -Recurse -Force

  # An install made by the released 0.5.0 installer: this version updates it and uninstalls it cleanly.
  $old = New-HarnessCopy; Copy-Item (Join-Path $repo 'install\test\legacy-0.5.0\install.ps1') (Join-Path $old 'install\install.ps1') -Force
  $oInst = Join-Path $old 'install\install.ps1'
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex and copilot project installed by 0.5.0, updated and uninstalled by this version'
  $agentsMd = Join-Path $proj 'AGENTS.md'; [IO.File]::WriteAllText($agentsMd, "# my notes`n")
  New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills\animate') | Out-Null; Set-Content (Join-Path $proj '.agents\skills\animate\SKILL.md') 'mine'
  & $oInst -Agent codex -Project $proj -Scope design | Out-Null
  Start-Sleep -Milliseconds 1100
  & $oInst -Agent copilot -Project $proj -Scope design | Out-Null
  Start-Sleep -Milliseconds 1100
  & $inst -Agent codex -Project $proj | Out-Null
  Check "the update keeps the 0.5.0 install's scope" { [bool]((Get-Content $agentsMd) | Where-Object { $_ -like 'Scope: design work only*' }) }
  Check 'the update recognises the 0.5.0 copies (no new backup)' { @(Get-ChildItem (Join-Path $proj '.makkov-harness\backups') -Directory).Count -eq 1 }
  & $uninst -Agent codex -Project $proj | Out-Null
  Check 'copilot (still 0.5.0) keeps its block and skills' { (Markers $agentsMd) -eq 1 -and (Test-Path (Join-Path $proj '.agents\skills\design-score')) }
  & $uninst -Agent copilot -Project $proj | Out-Null
  Check 'skills removed' { -not (Test-Path (Join-Path $proj '.agents\skills\design-score')) }
  Check 'your animate restored' { (Get-Content (Join-Path $proj '.agents\skills\animate\SKILL.md')) -eq 'mine' }
  Check 'block removed, your notes as they were' { [IO.File]::ReadAllText($agentsMd).TrimEnd() -eq '# my notes' }
  Check 'no manifest left' { -not (Get-ChildItem (Join-Path $proj '.makkov-harness') -Filter 'install-*.txt' -ErrorAction SilentlyContinue) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj, $old -Recurse -Force

  # A run in a child PowerShell, to see its exit code and what it wrote to stderr.
  function Run-Child([string]$Script, [string[]]$ArgList) {
    $ErrorActionPreference = 'Continue'
    $o = (& $exe -NoProfile -ExecutionPolicy Bypass -File $Script @ArgList 2>&1 | ForEach-Object { "$_" }) -join ' '
    $script:code = $LASTEXITCODE; $script:out = $o
  }

  # Fingerprints recorded by earlier PowerShell installers stay recognised: an install by the released 0.5.0
  # installer (culture-sorted ids) and by the one on main at 51cab04 (ordinal ids), of an animate that differs from
  # this version's, is updated by this version without taking that copy for yours.
  foreach ($legacy in @(@{ Name = '0.5.0'; Files = @('legacy-0.5.0\install.ps1') }, @{ Name = 'main at 51cab04'; Files = @('legacy-main-51cab04\install.ps1', 'legacy-main-51cab04\lib.ps1') })) {
    $old = New-HarnessCopy
    foreach ($f in $legacy.Files) { Copy-Item (Join-Path $repo "install\test\$f") (Join-Path $old ('install\' + (Split-Path -Leaf $f))) -Force }
    [IO.File]::WriteAllText((Join-Path $old 'skills\animate\OLDER.md'), "an older animate`n")
    $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
    Write-Output "codex project, an older animate installed by $($legacy.Name), updated by this version"
    & (Join-Path $old 'install\install.ps1') -Agent codex -Project $proj | Out-Null
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'the update takes the older copy for the harness''s (moves nothing aside)' { $script:code -eq 0 -and $script:out -notmatch 'Kept your earlier versions' }
    Check 'and replaces it with this version''s' { -not (Test-Path (Join-Path $proj '.agents\skills\animate\OLDER.md')) -and (Test-Path (Join-Path $proj '.agents\skills\animate\SKILL.md')) }
    & $uninst -Agent codex -Project $proj | Out-Null
    # 0.5.0 recorded no folders it made (no created_dir=), so its empty .agents and .makkov-harness folders stay;
    # no file may.
    $left = @(Entries $proj | Where-Object { $legacy.Name -ne '0.5.0' -or -not $_.PSIsContainer })
    Check 'the uninstall leaves nothing (0.5.0: no file; the empty folders it did not record stay)' { $left.Count -eq 0 }
    if ($left.Count) { $left | ForEach-Object { Write-Output "    left: $($_.FullName.Substring($proj.Length))" } }
    $env:USERPROFILE = $realHome; Remove-Item $h, $proj, $old -Recurse -Force
  }

  # The lock's clauses (install/lib.ps1): 2, a live lock refuses and nothing changes; 3, a stopped run's lock is taken
  # over; 5, an uninstall with no manifest clears a harness folder that holds only a stale lock, never a live one;
  # 4, the harness folder goes only when this run made it, and the release removes only its own owner file.
  $mhHost = try { [Net.Dns]::GetHostName() } catch { [Environment]::MachineName }
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $gone = Start-Process -FilePath $exe -ArgumentList '-NoProfile', '-Command', 'exit 0' -PassThru; $gone.WaitForExit(); $deadPid = $gone.Id
  function Set-Owner([string]$Dir, [int]$OwnerPid) {
    New-Item -ItemType Directory -Force (Join-Path $Dir '.makkov-harness\lock') | Out-Null
    [IO.File]::WriteAllText((Join-Path $Dir '.makkov-harness\lock\owner'), "pid=$OwnerPid`nhost=$mhHost`nstarted=$now`nby=test`n")
  }
  function Listing([string]$Dir) { (@(Get-ChildItem -LiteralPath $Dir -Recurse -Force | ForEach-Object { $_.FullName.Substring($Dir.Length) }) | Sort-Object) -join '|' }
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a lock a running process holds'
  Set-Owner $proj $PID; $before = Listing $proj
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Check 'install stops with exit code 1, says another run is working, changes nothing' { $script:code -eq 1 -and $script:out -match 'Another makkov-harness run' -and (Listing $proj) -eq $before }
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'an uninstall with no install leaves the live lock as it is' { $script:code -eq 1 -and $script:out -match 'No makkov-harness install' -and (Listing $proj) -eq $before }
  Write-Output 'codex project, a lock a stopped run left, and the takeover file of a run killed while taking it over'
  Set-Owner $proj $deadPid; [IO.File]::WriteAllText((Join-Path $proj '.makkov-harness\lock.takeover'), "pid=$deadPid`nhost=$mhHost`n")
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj); $c1 = $script:code
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'it is taken over: install and uninstall go through, nothing left' { $c1 -eq 0 -and $script:code -eq 0 -and (Entries $proj).Count -eq 0 }
  Write-Output 'codex project, only a lock and a manifest being written, left by a stopped first install, then an uninstall'
  Set-Owner $proj $deadPid; [IO.File]::WriteAllText((Join-Path $proj '.makkov-harness\install-cline.txt.new'), "agent=cline`n")
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'uninstall says no install was found (exit 1), takes the lock over and leaves nothing' { $script:code -eq 1 -and $script:out -match 'No makkov-harness install' -and (Entries $proj).Count -eq 0 }
  Write-Output 'codex project, an empty .makkov-harness of yours, an install that stops before any change'
  New-Item -ItemType Directory -Force (Join-Path $proj '.makkov-harness'), (Join-Path $proj 'AGENTS.md') | Out-Null; $before = Listing $proj
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Check 'install stops (exit 1) and the folder it did not make is still there' { $script:code -eq 1 -and (Listing $proj) -eq $before }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force
  Write-Output "the lock's release removes only its own owner file"
  $proj = New-Temp; $st = Join-Path $proj '.makkov-harness'
  $probe = Join-Path (New-Temp) 'release.ps1'
  [IO.File]::WriteAllText($probe, @(
    'param([string]$Lib, [string]$State, [switch]$Foreign)',
    '. $Lib',
    '$h = Enter-MhLock $State $State',
    'if ($Foreign) { [IO.File]::WriteAllText((Join-Path $h.Lock ''owner''), "pid=1`nhost=elsewhere`n") }',
    'Exit-MhLock $h'
  ) -join "`n")
  & $exe -NoProfile -ExecutionPolicy Bypass -File $probe -Lib (Join-Path $repo 'install\lib.ps1') -State $st -Foreign | Out-Null
  Check "another run's owner file stays" { [IO.File]::ReadAllText((Join-Path $st 'lock\owner')) -match 'host=elsewhere' }
  Remove-Item $st -Recurse -Force
  & $exe -NoProfile -ExecutionPolicy Bypass -File $probe -Lib (Join-Path $repo 'install\lib.ps1') -State $st | Out-Null
  Check 'its own owner file, the lock and the folder it made go' { (Entries $proj).Count -eq 0 }
  Remove-Item $proj, (Split-Path -Parent $probe) -Recurse -Force

  # Paths with spaces and with [ ] (read as a wildcard without -LiteralPath).
  foreach ($pname in 'My Project', 'design [v2]') {
    $h = New-Temp; $parent = New-Temp; $proj = Join-Path $parent $pname; $env:USERPROFILE = $h
    New-Item -ItemType Directory -Force -Path (Join-Path $proj '.agents\skills\animate') | Out-Null
    [IO.File]::WriteAllText((Join-Path $proj '.agents\skills\animate\SKILL.md'), "mine`n")
    Write-Output "codex, project path '$pname'"
    & $inst -Agent codex -Project $proj | Out-Null
    Check 'installed into the path' { (Test-Path -LiteralPath (Join-Path $proj '.agents\skills\design-score\SKILL.md')) -and (Markers (Join-Path $proj 'AGENTS.md')) -eq 1 }
    Start-Sleep -Milliseconds 1100
    & $inst -Agent codex -Project $proj | Out-Null
    Check 'an update makes no new backup' { @(Get-ChildItem -LiteralPath (Join-Path $proj '.makkov-harness\backups') -Directory).Count -eq 1 }
    & $uninst -Agent codex -Project $proj | Out-Null
    Check 'your animate restored' { [IO.File]::ReadAllText((Join-Path $proj '.agents\skills\animate\SKILL.md')) -eq "mine`n" }
    Check 'our skills and block removed' { -not (Test-Path -LiteralPath (Join-Path $proj '.agents\skills\design-score')) -and -not (Test-Path -LiteralPath (Join-Path $proj 'AGENTS.md')) }
    $env:USERPROFILE = $realHome; Remove-Item -LiteralPath $h, $parent -Recurse -Force
  }

  # The personal layer harness-onboarding writes: an update keeps it, the uninstall removes it (and keeps a copy).
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project and cursor project, with a personal layer'
  $agentsMd = Join-Path $proj 'AGENTS.md'
  [IO.File]::WriteAllText($agentsMd, "# my notes`n")
  & $inst -Agent codex -Project $proj | Out-Null
  [IO.File]::AppendAllText($agentsMd, "`n<!-- makkov-harness:personal:start -->`n# Personal layer (makkov-harness)`n- Answer in English.`n<!-- makkov-harness:personal:end -->`n")
  Start-Sleep -Milliseconds 1100
  & $inst -Agent codex -Project $proj | Out-Null
  Check 'an update keeps the personal layer' { (Get-Content $agentsMd) -contains '- Answer in English.' }
  & $uninst -Agent codex -Project $proj | Out-Null
  Check 'the uninstall removes the personal layer' { -not ((Get-Content $agentsMd) | Where-Object { $_ -match 'makkov-harness:personal|^- Answer in English\.' }) }
  Check 'your notes kept, byte for byte' { [IO.File]::ReadAllText($agentsMd) -ceq "# my notes`n" }
  & $inst -Agent cursor -Project $proj | Out-Null
  $personal = Join-Path $proj '.cursor\rules\makkov-harness-personal.mdc'
  Set-Content $personal "---`nalwaysApply: true`n---`n<!-- makkov-harness:personal:start -->`n- Answer in English.`n<!-- makkov-harness:personal:end -->"
  & $uninst -Agent cursor -Project $proj | Out-Null
  Check "the uninstall removes Cursor's personal rule" { -not (Test-Path $personal) }
  Check 'a copy of it is kept aside' { [bool](Get-ChildItem (Join-Path $proj '.makkov-harness\backups') -Recurse -Filter 'makkov-harness-personal.mdc') }
  Check 'no empty .cursor folder left' { -not (Test-Path (Join-Path $proj '.cursor')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # Everything listed under a folder, with hashes: equal listings mean nothing changed, manifests included.
  function Tree([string]$Dir) {
    $root = (Resolve-Path -LiteralPath $Dir).ProviderPath
    (@(Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object {
      $r = $_.FullName.Substring($root.Length)
      if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { "$r -> link" }
      elseif ($_.PSIsContainer) { "$r\" } else { "$r " + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    }) | Sort-Object) -join "`n"
  }

  # A first install that cannot finish stops before it changes anything.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, AGENTS.md is a folder'
  New-Item -ItemType Directory -Force (Join-Path $proj 'AGENTS.md'), (Join-Path $proj '.agents\skills\animate') | Out-Null
  Set-Content (Join-Path $proj '.agents\skills\animate\SKILL.md') 'mine'
  $before = Tree $proj
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Check 'install stops with exit code 1 and says why' { $script:code -eq 1 -and $script:out -match 'not a regular file' }
  Check 'nothing changed: no skills, no backup, no manifest' { (Tree $proj) -eq $before }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, read-only AGENTS.md'
  $agentsMd = Join-Path $proj 'AGENTS.md'; $exp = Join-Path $h 'expected'
  [IO.File]::WriteAllText($agentsMd, "# mine`n"); Copy-Item $agentsMd $exp; (Get-Item $agentsMd).IsReadOnly = $true
  $before = Tree $proj
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Check 'install stops with exit code 1 and says why' { $script:code -eq 1 -and $script:out -match 'read-only' }
  Check 'nothing changed' { (Tree $proj) -eq $before }
  (Get-Item $agentsMd).IsReadOnly = $false
  & $inst -Agent codex -Project $proj | Out-Null; & $uninst -Agent codex -Project $proj | Out-Null
  Check 'once writable, install and uninstall put it back as it was' { (Same $exp $agentsMd) -and -not (Test-Path (Join-Path $proj '.makkov-harness')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # An interrupted install (the run stops after the skills, or after the file) can be uninstalled at once, or run
  # again and then uninstalled; either way your skill and your file come back as they were.
  foreach ($stopAt in 'skills', 'rules') {
    foreach ($then in 'uninstall', 'rerun') {
      $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
      Write-Output "codex project, install stopped after the $stopAt step, then $then"
      $agentsMd = Join-Path $proj 'AGENTS.md'; $exp = Join-Path $h 'expected'
      [IO.File]::WriteAllText($agentsMd, '# mine'); Copy-Item $agentsMd $exp
      New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills\animate') | Out-Null; Set-Content (Join-Path $proj '.agents\skills\animate\SKILL.md') 'mine'
      $env:MAKKOV_HARNESS_TEST = '1'; $env:MAKKOV_HARNESS_TEST_STOP = $stopAt
      try { & $inst -Agent codex -Project $proj 2>$null | Out-Null } catch { }
      Remove-Item Env:\MAKKOV_HARNESS_TEST, Env:\MAKKOV_HARNESS_TEST_STOP
      Check 'a manifest is there after the interruption' { Test-Path (Join-Path $proj '.makkov-harness\install-codex.txt') }
      if ($then -eq 'rerun') { & $inst -Agent codex -Project $proj | Out-Null }
      & $uninst -Agent codex -Project $proj | Out-Null
      Check 'your animate is back' { (Get-Content (Join-Path $proj '.agents\skills\animate\SKILL.md')) -eq 'mine' }
      Check 'your file is back byte for byte' { Same $exp $agentsMd }
      Check 'nothing of the harness left' { -not (Test-Path (Join-Path $proj '.makkov-harness')) -and ((@(Get-ChildItem (Join-Path $proj '.agents\skills')) | ForEach-Object Name) -join ',') -eq 'animate' }
      $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force
    }
  }

  # Your file's bytes pass through as they are: another encoding, a byte order mark, edited after the install.
  # A UTF-16 file is not rewritten at all.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a Windows-1251 file and a UTF-8 file with a BOM, edited after the install'
  $agentsMd = Join-Path $proj 'AGENTS.md'
  foreach ($kind in 'cp1251', 'bom') {
    $bytes = if ($kind -eq 'cp1251') { [byte[]](0x23, 0x20, 0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2, 0x0D, 0x0A) } else { [byte[]](0xEF, 0xBB, 0xBF, 0x23, 0x20, 0x6E, 0xE2, 0x80, 0x94, 0x0A) }
    [IO.File]::WriteAllBytes($agentsMd, $bytes)
    & $inst -Agent codex -Project $proj | Out-Null; & $inst -Agent codex -Project $proj -Scope design | Out-Null
    $now = [IO.File]::ReadAllBytes($agentsMd)
    Check "${kind}: your bytes are unchanged at the top of the file" { [Convert]::ToBase64String([byte[]]$now[0..($bytes.Length - 1)]) -eq [Convert]::ToBase64String($bytes) }
    [IO.File]::WriteAllBytes($agentsMd, [byte[]]($now + [byte[]](0x61, 0x64, 0x64, 0x65, 0x64, 0x0A)))
    & $uninst -Agent codex -Project $proj | Out-Null
    Check "${kind}: after the uninstall your bytes and your edit are there" { [Convert]::ToBase64String([IO.File]::ReadAllBytes($agentsMd)) -eq [Convert]::ToBase64String([byte[]]($bytes + [byte[]](0x61, 0x64, 0x64, 0x65, 0x64, 0x0A))) }
    Remove-Item (Join-Path $proj '.makkov-harness') -Recurse -Force
  }
  [IO.File]::WriteAllBytes($agentsMd, [byte[]](0xFF, 0xFE, 0x23, 0x00, 0x20, 0x00, 0x6D, 0x00, 0x0A, 0x00)); $before = Tree $proj
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Check 'a UTF-16 file: install stops with exit code 1 and says why' { $script:code -eq 1 -and $script:out -match 'UTF-16' }
  Check 'and changes nothing' { (Tree $proj) -eq $before }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A manifest is not trusted: one that points outside the folder, or names paths the installer would not use,
  # stops install and uninstall before any change.
  foreach ($tamper in 'rules', 'skill', 'created', 'backup', 'empty') {
    $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
    Write-Output "codex project, manifest edited: $tamper"
    $precious = Join-Path $h 'precious.txt'; Set-Content $precious 'PRECIOUS'; New-Item -ItemType Directory -Force (Join-Path $h 'outside\keep') | Out-Null
    & $inst -Agent codex -Project $proj | Out-Null
    $mf = Join-Path $proj '.makkov-harness\install-codex.txt'; $ml = @(Get-Content $mf)
    switch ($tamper) {
      'rules'   { $ml = @($ml | ForEach-Object { if ($_ -like 'rules=*') { "rules=$precious" } else { $_ } }) }
      'skill'   { $ml += 'skill=../../../outside 123' }
      'created' { $ml += 'created_dir=../outside' }
      'backup'  { $ml += 'backup=' + (Join-Path $h 'outside') }
      'empty'   { $ml = @() }
    }
    [IO.File]::WriteAllLines($mf, [string[]]$ml)
    $before = Tree $proj
    Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
    Check 'uninstall stops with exit code 1 and says the manifest is not one it wrote' { $script:code -eq 1 -and $script:out -match 'does not look like a manifest' }
    Check 'nothing changed in the project or outside it' { (Tree $proj) -eq $before -and (Get-Content $precious) -eq 'PRECIOUS' -and (Test-Path (Join-Path $h 'outside\keep')) }
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'install stops too' { $script:code -eq 1 -and (Tree $proj) -eq $before }
    $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force
  }

  # A file that already holds a marked block is kept as it was before the install, and the copy stays after the
  # uninstall, since the file then differs from it.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, your file already has a marked block'
  $agentsMd = Join-Path $proj 'AGENTS.md'; $exp = Join-Path $h 'expected'
  [IO.File]::WriteAllText($agentsMd, "# doc`n<!-- makkov-harness:start -->`nMY EXAMPLE TEXT`n<!-- makkov-harness:end -->`nafter`n"); Copy-Item $agentsMd $exp
  & $inst -Agent codex -Project $proj | Out-Null
  $orig = Join-Path $proj '.makkov-harness\backups\original\AGENTS.md'
  Check 'a copy of your file as it was, block and all' { Same $exp $orig }
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'the copy stays after the uninstall, and the uninstall says where' { (Same $exp $orig) -and $script:out -match 'is kept in' }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A symlink to a file that does not exist: nothing is created outside the project, and the link is not deleted.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, AGENTS.md is a dangling symlink'
  $target = Join-Path $h 'target.md'; $link = Join-Path $proj 'AGENTS.md'; $linked = $true
  try { Set-Content $target 'x'; New-Item -ItemType SymbolicLink -Path $link -Target $target | Out-Null; Remove-Item $target } catch { $linked = $false; Write-Output '  skip (no right to create symlinks here)' }
  if ($linked) {
    $before = Tree $proj
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'install stops with exit code 1 and says why' { $script:code -eq 1 -and $script:out -match 'does not exist' }
    Check 'nothing changed, and no target created' { (Tree $proj) -eq $before -and -not (Test-Path $target) }
  }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A file of blank lines and spaces comes back as it was.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a file of whitespace only'
  $agentsMd = Join-Path $proj 'AGENTS.md'; $exp = Join-Path $h 'expected'
  [IO.File]::WriteAllText($agentsMd, "  `n`n`t`n"); Copy-Item $agentsMd $exp
  & $inst -Agent codex -Project $proj | Out-Null; & $uninst -Agent codex -Project $proj | Out-Null
  Check 'put back byte for byte' { (Same $exp $agentsMd) -and -not (Test-Path (Join-Path $proj '.makkov-harness')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # An uninstall that cannot finish stops before it changes anything, and works once it can.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, uninstall with a read-only AGENTS.md'
  $agentsMd = Join-Path $proj 'AGENTS.md'; $exp = Join-Path $h 'expected'
  [IO.File]::WriteAllText($agentsMd, "# mine`n"); Copy-Item $agentsMd $exp
  New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills\animate') | Out-Null; Set-Content (Join-Path $proj '.agents\skills\animate\SKILL.md') 'mine'
  & $inst -Agent codex -Project $proj | Out-Null; (Get-Item $agentsMd).IsReadOnly = $true; $before = Tree $proj
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'uninstall stops with exit code 1 and changes nothing' { $script:code -eq 1 -and (Tree $proj) -eq $before }
  (Get-Item $agentsMd).IsReadOnly = $false; & $uninst -Agent codex -Project $proj | Out-Null
  Check 'once writable, the uninstall puts back your file and your animate' { (Same $exp $agentsMd) -and (Get-Content (Join-Path $proj '.agents\skills\animate\SKILL.md')) -eq 'mine' -and -not (Test-Path (Join-Path $proj '.makkov-harness')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A skill another agent's newer install updated is still the harness's own when the older agent goes last.
  $src = New-HarnessCopy; $sInst = Join-Path $src $ri; $sUninst = Join-Path $src $ru
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex from an older copy, copilot from a newer one, uninstalled copilot first'
  & $sInst -Agent codex -Project $proj | Out-Null
  Set-Content (Join-Path $src 'skills\animate\CHANGES.md') 'newer'
  & $sInst -Agent copilot -Project $proj | Out-Null
  & $sUninst -Agent copilot -Project $proj | Out-Null
  & $uninst -Agent codex -Project $proj | Out-Null
  Check 'nothing taken for yours, nothing left' { (Entries $proj).Count -eq 0 }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj, $src -Recurse -Force

  # Agents without skills (Aider) next to agents with them; and a project path that is your home folder.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'aider and codex in one project'
  & $inst -Agent aider -Project $proj | Out-Null
  & $inst -Agent codex -Project $proj | Out-Null
  Check 'codex installs next to aider' { Test-Path (Join-Path $proj '.agents\skills\design-score') }
  & $uninst -Agent codex -Project $proj | Out-Null; & $uninst -Agent aider -Project $proj | Out-Null
  Check 'both uninstall, nothing left' { (Entries $proj).Count -eq 0 }
  Write-Output 'codex with the home folder as the project path'
  Run-Child $inst @('-Agent', 'codex', '-Project', $h)
  Check 'install stops with exit code 2 and says why' { $script:code -eq 2 -and $script:out -match 'home folder' }
  # (The child PowerShell may write its own caches under the home folder: check what the harness would write.)
  Check 'nothing written' { -not (Test-Path (Join-Path $h '.makkov-harness')) -and -not (Test-Path (Join-Path $h '.agents')) -and -not (Test-Path (Join-Path $h 'AGENTS.md')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # Two agents sharing the skills folder and AGENTS.md in a path with a space or [ ], with a file outside the
  # project named like the path's first word: uninstalling one leaves the other working, and nothing outside.
  foreach ($pname in 'My Project', 'design [v2]') {
    $h = New-Temp; $parent = New-Temp; $proj = Join-Path $parent $pname; $env:USERPROFILE = $h
    New-Item -ItemType Directory -Force -Path $proj | Out-Null
    $word = Join-Path $parent ($pname -split ' ')[0]; [IO.File]::WriteAllText($word, "mine`n")
    Write-Output "codex and copilot, project path '$pname'"
    & $inst -Agent codex -Project $proj | Out-Null; & $inst -Agent copilot -Project $proj | Out-Null
    Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
    Check 'codex uninstalls while copilot shares the folder' { $script:code -eq 0 -and (Test-Path -LiteralPath (Join-Path $proj '.agents\skills\design-score')) }
    & $uninst -Agent copilot -Project $proj | Out-Null
    Check 'then copilot; nothing left, nothing outside the project touched' { (Entries $proj).Count -eq 0 -and [IO.File]::ReadAllText($word) -eq "mine`n" }
    $env:USERPROFILE = $realHome; Remove-Item -LiteralPath $h, $parent -Recurse -Force
  }

  # Several agents in one folder, uninstalled in any order: no later install or uninstall is refused, and a folder
  # that had no AGENTS.md has none afterwards (project and user level).
  foreach ($level in 'project', 'home') {
    foreach ($order in @('codex', 'copilot', 'cline'), @('cline', 'codex', 'copilot'), @('copilot', 'cline', 'codex')) {
      $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
      $agents = if ($level -eq 'home') { 'codex', 'cline', 'gemini' } else { 'codex', 'copilot', 'cline' }
      $pa = @{}; if ($level -eq 'project') { $pa.Project = $proj }
      $b = if ($level -eq 'project') { $proj } else { $h }
      Write-Output "${level}: install $($agents -join ' '), uninstall in the order of: $($order -join ' ')"
      foreach ($a in $agents) { & $inst -Agent $a @pa | Out-Null }
      $okall = $true; $i = 0
      foreach ($a in $order) {
        if ($level -eq 'home' -and $a -eq 'copilot') { $a = 'gemini' }
        $args_ = @('-Agent', $a); if ($level -eq 'project') { $args_ += @('-Project', $proj) }
        Run-Child $uninst $args_; if ($script:code -ne 0) { $okall = $false }
        $i++
        if ($i -eq 1) {
          Run-Child $inst $args_; if ($script:code -ne 0) { $okall = $false }
          Run-Child $uninst $args_; if ($script:code -ne 0) { $okall = $false }
        }
      }
      Check 'every uninstall and the reinstall in between went through' { $okall }
      # (At user level the child PowerShell may leave its own caches in the home folder: check the harness's paths.)
      if ($level -eq 'project') { Check 'nothing left, no AGENTS.md made up' { (Entries $proj).Count -eq 0 } }
      else { Check 'nothing left, no AGENTS.md made up' { -not (Test-Path (Join-Path $h '.makkov-harness')) -and -not (Test-Path (Join-Path $h '.agents')) -and -not (Test-Path (Join-Path $h '.codex')) -and -not (Test-Path (Join-Path $h '.cline')) -and -not (Test-Path (Join-Path $h '.gemini')) } }
      $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force
    }
  }
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex and copilot, no AGENTS.md before: the second install does not take the harness''s file for yours'
  & $inst -Agent codex -Project $proj -Scope design | Out-Null; & $inst -Agent copilot -Project $proj | Out-Null; & $inst -Agent codex -Project $proj | Out-Null
  Check 'no copy of a file you never had' { -not (Test-Path (Join-Path $proj '.makkov-harness\backups\original')) }
  & $uninst -Agent copilot -Project $proj | Out-Null; & $uninst -Agent codex -Project $proj | Out-Null
  Check 'nothing left' { (Entries $proj).Count -eq 0 }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # Interrupted after the first skill is in place: a skill of yours the run did not reach is not taken for ours,
  # and no half-made copy is left behind.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, install stopped after the first skill, your style-sampling not reached yet'
  $sk = Join-Path $proj '.agents\skills'
  New-Item -ItemType Directory -Force (Join-Path $sk 'style-sampling'), (Join-Path $sk '.mh-tmp-animate') | Out-Null
  [IO.File]::WriteAllText((Join-Path $sk 'style-sampling\SKILL.md'), "MINE`n"); [IO.File]::WriteAllText((Join-Path $sk '.mh-tmp-animate\x'), "half`n")
  $env:MAKKOV_HARNESS_TEST = '1'; $env:MAKKOV_HARNESS_TEST_STOP = 'skill'
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Remove-Item Env:\MAKKOV_HARNESS_TEST, Env:\MAKKOV_HARNESS_TEST_STOP
  Check 'the run stopped there' { $script:code -eq 1 -and $script:out -match 'stopped after skill' }
  Check 'your style-sampling is still where it was' { [IO.File]::ReadAllText((Join-Path $sk 'style-sampling\SKILL.md')) -eq "MINE`n" }
  & $uninst -Agent codex -Project $proj | Out-Null
  Check 'after the uninstall it is still yours and in place' { [IO.File]::ReadAllText((Join-Path $sk 'style-sampling\SKILL.md')) -eq "MINE`n" -and -not (Test-Path (Join-Path $proj '.makkov-harness')) }
  Check 'no half-made copies left' { ((@(Get-ChildItem -LiteralPath $sk -Force) | ForEach-Object Name) -join ',') -eq 'style-sampling' }
  Write-Output 'the test hook needs MAKKOV_HARNESS_TEST=1'
  Remove-Item (Join-Path $proj '.agents') -Recurse -Force
  $env:MAKKOV_HARNESS_TEST_STOP = 'skills'
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Remove-Item Env:\MAKKOV_HARNESS_TEST_STOP
  $mfl = @(Get-Content (Join-Path $proj '.makkov-harness\install-codex.txt'))
  Check 'without it, the install runs to the end' { $script:code -eq 0 -and @($mfl | Where-Object { $_ -like 'rules=*' }).Count -eq 1 -and @($mfl | Where-Object { $_ -like 'skill=*' } | ForEach-Object { ($_.Substring(6) -split ' ')[0] } | Select-Object -Unique).Count -eq $expected }
  & $uninst -Agent codex -Project $proj | Out-Null
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # An edit of only whitespace or line ends after the install is yours, and stays.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, you change only line ends and trailing spaces after the install'
  $agentsMd = Join-Path $proj 'AGENTS.md'
  [IO.File]::WriteAllText($agentsMd, "# mine`r`nline  `r`n")
  & $inst -Agent codex -Project $proj | Out-Null
  [IO.File]::WriteAllText($agentsMd, ([IO.File]::ReadAllText($agentsMd) -replace "`r`n", "`n" -replace 'line  \n', "line`n"))
  & $uninst -Agent codex -Project $proj | Out-Null
  Check 'your LF line ends and trimmed line stay' { [Convert]::ToBase64String([IO.File]::ReadAllBytes($agentsMd)) -eq [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("# mine`nline`n")) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A file where a skill folder goes stops the install before any change.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a file named like a skill folder'
  New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills') | Out-Null; Set-Content (Join-Path $proj '.agents\skills\html-report') 'x'
  $before = Tree $proj
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
  Check 'install stops with exit code 1, names the file, changes nothing' { $script:code -eq 1 -and $script:out -match 'is a file' -and (Tree $proj) -eq $before }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # Two agents with different skills folders installed in the same second each keep their own backup folder: your
  # skill moved aside by one is put back into that one's skills folder, never into the other's.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'two agents installed in the same second'
  New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills\animate') | Out-Null; [IO.File]::WriteAllText((Join-Path $proj '.agents\skills\animate\SKILL.md'), "mine`n")
  $before = Tree $proj
  function global:Get-Date { '20260101-000000' }   # (a function goes before the cmdlet: every run gets the same second)
  try {
    & $inst -Agent codex -Project $proj | Out-Null; & $inst -Agent cline -Project $proj | Out-Null
    Check 'the backup folder is named for the agent' { Test-Path -LiteralPath (Join-Path $proj '.makkov-harness\backups\20260101-000000-codex\skills\animate\SKILL.md') }
    & $uninst -Agent cline -Project $proj | Out-Null; & $uninst -Agent codex -Project $proj | Out-Null
  } finally { Remove-Item Function:\Get-Date }
  Check 'your animate is back where it was, nothing else left' { (Tree $proj) -eq $before }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A home folder given by its 8.3 short name (as Git Bash's cygpath and the TEMP variable often give it): the
  # installers know their own manifest and the skills they copied, though Windows lists files under the long name.
  $h = New-Temp; $long = Join-Path $h 'longfoldername-home'; New-Item -ItemType Directory -Force $long | Out-Null
  $short = $null; try { $short = (New-Object -ComObject Scripting.FileSystemObject).GetFolder($long).ShortPath } catch { }
  Write-Output 'codex and cline at user level, the home folder given by its 8.3 short name'
  if ($short -and $short -ne $long) {
    $env:USERPROFILE = $short
    & $inst -Agent codex | Out-Null; & $inst -Agent cline | Out-Null
    Run-Child $inst @('-Agent', 'codex')
    Check 'a second run takes our copies for ours (moves nothing aside)' { $script:code -eq 0 -and $script:out -notmatch 'Kept your earlier versions' }
    & $uninst -Agent cline | Out-Null
    Run-Child $uninst @('-Agent', 'codex')
    Check 'the uninstall does not take its own manifest for another agent''s' { $script:code -eq 0 -and $script:out -notmatch 'also installed there' }
    Check 'nothing of the harness left' { -not (Test-Path (Join-Path $long '.makkov-harness')) -and -not (Test-Path (Join-Path $long '.agents')) -and -not (Test-Path (Join-Path $long '.codex')) -and -not (Test-Path (Join-Path $long '.cline')) }
  } else { Write-Output '  skip (this volume makes no 8.3 short names)' }
  $env:USERPROFILE = $realHome; Remove-Item $h -Recurse -Force

  # A hard-linked instructions file in a project may be a file outside it under another name: the run stops unless
  # -FollowLinks. With it, the file stays one file under both names: it is written in place, not replaced.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, AGENTS.md hard-linked to a file outside the project'
  $agentsMd = Join-Path $proj 'AGENTS.md'; $linked = Join-Path $h 'linked.md'; $exp = Join-Path $h 'expected'
  [IO.File]::WriteAllText($agentsMd, "# mine`n"); Copy-Item $agentsMd $exp
  $hard = $true; try { New-Item -ItemType HardLink -Path $linked -Target $agentsMd | Out-Null } catch { $hard = $false; Write-Output '  skip (no hard links on this file system)' }
  if ($hard) {
    $pbefore = Tree $proj
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'without -FollowLinks the install stops (exit 1), says why, changes nothing' { $script:code -eq 1 -and $script:out -match 'hard link' -and (Same $exp $linked) -and (Tree $proj) -eq $pbefore }
    & $inst -Agent codex -Project $proj -FollowLinks | Out-Null
    Check 'the other name shows the routing block too' { (Markers $linked) -eq 1 }
    & $uninst -Agent codex -Project $proj -FollowLinks | Out-Null
    Check 'after the uninstall, still linked and as it was' { (Same $exp $linked) -and (Same $exp $agentsMd) -and (Get-Item -LiteralPath $agentsMd).LinkType -eq 'HardLink' }
  }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A link left under a temporary name is removed as a link: the folder it points to keeps its files (Windows
  # PowerShell 5.1's Remove-Item -Recurse on a junction deletes them).
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a junction to a folder of yours left as .mh-tmp-animate'
  $target = Join-Path $h 'target'; New-Item -ItemType Directory -Force $target, (Join-Path $proj '.agents\skills') | Out-Null
  [IO.File]::WriteAllText((Join-Path $target 'file'), "keep`n")
  $j = Join-Path $proj '.agents\skills\.mh-tmp-animate'; $made = $true
  try { New-Item -ItemType Junction -Path $j -Target $target | Out-Null } catch { try { New-Item -ItemType SymbolicLink -Path $j -Target $target | Out-Null } catch { $made = $false; Write-Output '  skip (no junctions or symlinks here)' } }
  if ($made) {
    & $inst -Agent codex -Project $proj | Out-Null; & $uninst -Agent codex -Project $proj | Out-Null
    Check 'the link is gone, the folder it pointed to is untouched' { -not (Test-Path -LiteralPath $j) -and [IO.File]::ReadAllText((Join-Path $target 'file')) -eq "keep`n" }
  }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A manifest written by install.sh (LF line ends; on Windows, Git Bash /c/x or WSL /mnt/c/x paths) is read by
  # the PowerShell installer.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output "a manifest in install.sh's form"
  . (Join-Path $repo 'install\lib.ps1')
  if ([IO.Path]::DirectorySeparatorChar -eq '\') {
    Check 'Git Bash paths read as Windows paths' { (ConvertFrom-MhShellPath '/c/Users/me/p') -eq 'C:\Users\me\p' }
    Check 'and WSL paths' { (ConvertFrom-MhShellPath '/mnt/d/work') -eq 'D:\work' }
  }
  & $inst -Agent codex -Project $proj | Out-Null
  $mf = Join-Path $proj '.makkov-harness\install-codex.txt'
  $ml = @(Get-Content $mf | ForEach-Object {
    if ($_ -match '^(base|skills_dir|rules|rules_backup|backup)=([A-Za-z]):\\(.*)$') { $Matches[1] + '=/' + $Matches[2].ToLowerInvariant() + '/' + ($Matches[3] -replace '\\', '/') } else { $_ }
  })
  [IO.File]::WriteAllText($mf, (($ml -join "`n") + "`n"))
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'the uninstall accepts it and removes everything' { $script:code -eq 0 -and (Entries $proj).Count -eq 0 }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # Everything under .makkov-harness\ and in the skills folder may have come with a cloned repository.
  function Write-Hostile([string]$File, [string[]]$Skills) {
    $l = @('agent=codex', 'installed=20250101-000000', 'base=C:\x', 'skills_dir=C:\x\.agents\skills', 'rules=C:\x\AGENTS.md', 'rules_existed=0', 'rules_backup=', 'scope=all')
    if ([IO.Path]::DirectorySeparatorChar -ne '\') { $l = @($l | ForEach-Object { $_ -replace 'C:\\x', '/x' -replace '\\', '/' }) }
    [IO.File]::WriteAllText($File, ((@($l) + @($Skills | ForEach-Object { "skill=$_" })) -join "`n") + "`n")
  }
  # A repository that ships .agents\skills as a link to a folder outside the project and a manifest whose skill=
  # entries name folders there: the installer follows no link there and changes nothing outside the project.
  $h = New-Temp; $proj = New-Temp; $outside = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a cloned .agents\skills that links outside, with a manifest naming folders there'
  New-Item -ItemType Directory -Force (Join-Path $outside 'Documents'), (Join-Path $outside '.ssh'), (Join-Path $outside 'emptyish'), (Join-Path $proj '.agents'), (Join-Path $proj '.makkov-harness') | Out-Null
  Set-Content (Join-Path $outside 'Documents\a.txt') 'mine'; Set-Content (Join-Path $outside '.ssh\id') 'key'
  $linked = $true
  try { New-Item -ItemType SymbolicLink -Path (Join-Path $proj '.agents\skills') -Target $outside | Out-Null } catch { $linked = $false; Write-Output '  skip (no right to create symlinks here)' }
  if ($linked) {
    Write-Hostile (Join-Path $proj '.makkov-harness\install-codex.txt') @('Documents 123', 'emptyish e3b0c44298fc1c14')
    $before = Tree $outside; $pbefore = Tree $proj
    Run-Child $uninst @('-Agent', 'codex', '-Project', $proj); $c1 = $script:code; $o1 = $script:out
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'uninstall and install stop (exit 1) and say it leads outside through a link' { $c1 -eq 1 -and $script:code -eq 1 -and $o1 -match 'outside the project through a link' -and $script:out -match 'outside the project through a link' }
    Check 'nothing moved or deleted outside the project, nothing changed in it' { (Tree $outside) -eq $before -and (Tree $proj) -eq $pbefore }
    Write-Hostile (Join-Path $proj '.makkov-harness\install-codex.txt') @('Documents 123', '.ssh', 'emptyish e3b0c44298fc1c14')
    Run-Child $uninst @('-Agent', 'codex', '-Project', $proj); $c1 = $script:code; Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'with a .ssh entry too, both stop (exit 1)' { $c1 -eq 1 -and $script:code -eq 1 }
    Write-Hostile (Join-Path $proj '.makkov-harness\install-codex.txt') @('Documents 123', 'emptyish e3b0c44298fc1c14')
    Run-Child $uninst @('-Agent', 'codex', '-Project', $proj, '-FollowLinks')
    Check 'with -FollowLinks the uninstall goes through and leaves Documents and emptyish where they are' { $script:code -eq 0 -and (Test-Path (Join-Path $outside 'Documents\a.txt')) -and (Test-Path (Join-Path $outside 'emptyish')) -and (Test-Path (Join-Path $outside '.ssh\id')) }
    [IO.Directory]::Delete((Join-Path $proj '.agents\skills'))
  }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj, $outside -Recurse -Force
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a cloned manifest naming a dot folder'
  New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills\.ssh'), (Join-Path $proj '.makkov-harness') | Out-Null; Set-Content (Join-Path $proj '.agents\skills\.ssh\id') 'key'
  Write-Hostile (Join-Path $proj '.makkov-harness\install-codex.txt') @('.ssh')
  $pbefore = Tree $proj
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'uninstall refuses the manifest (exit 1), nothing changed' { $script:code -eq 1 -and $script:out -match 'not a plain folder name' -and (Tree $proj) -eq $pbefore }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a cloned manifest naming folders that are not skills (no SKILL.md, or no files at all)'
  New-Item -ItemType Directory -Force (Join-Path $proj '.agents\skills\Documents'), (Join-Path $proj '.agents\skills\emptyish\sub'), (Join-Path $proj '.makkov-harness') | Out-Null
  Set-Content (Join-Path $proj '.agents\skills\Documents\a.txt') 'mine'
  Write-Hostile (Join-Path $proj '.makkov-harness\install-codex.txt') @('Documents 123', 'emptyish e3b0c44298fc1c14', 'emptyish 4294967295')
  Run-Child $inst @('-Agent', 'codex', '-Project', $proj); $c1 = $script:code
  Check 'install goes through and leaves both folders as they were' { $c1 -eq 0 -and (Test-Path (Join-Path $proj '.agents\skills\Documents\a.txt')) -and (Test-Path (Join-Path $proj '.agents\skills\emptyish\sub')) }
  Write-Hostile (Join-Path $proj '.makkov-harness\install-codex.txt') @('Documents 123', 'emptyish e3b0c44298fc1c14', 'emptyish 4294967295')
  Run-Child $uninst @('-Agent', 'codex', '-Project', $proj)
  Check 'uninstall goes through and deletes neither (no SKILL.md, so neither is taken for ours)' { $script:code -eq 0 -and (Test-Path (Join-Path $proj '.agents\skills\Documents\a.txt')) -and (Test-Path (Join-Path $proj '.agents\skills\emptyish\sub')) }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # In a project, an instructions file (or a folder on its way) that is a link leading outside the project may have
  # come with the repository: the run stops unless -FollowLinks, and the file outside is never changed or copied.
  $h = New-Temp; $proj = New-Temp; $outside = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, AGENTS.md a link to a file outside the project'
  $notes = Join-Path $outside 'notes.md'; $exp = Join-Path $h 'expected'; [IO.File]::WriteAllText($notes, "# not yours to change`n"); Copy-Item $notes $exp
  $linked = $true
  try { New-Item -ItemType SymbolicLink -Path (Join-Path $proj 'AGENTS.md') -Target $notes | Out-Null } catch { $linked = $false; Write-Output '  skip (no right to create symlinks here)' }
  if ($linked) {
    $pbefore = Tree $proj
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'install stops (exit 1) and names -FollowLinks' { $script:code -eq 1 -and $script:out -match 'FollowLinks' }
    Check 'the file outside is byte for byte as it was, and no copy of it is in the project' { (Same $exp $notes) -and (Tree $proj) -eq $pbefore }
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj, '-FollowLinks')
    Check 'with -FollowLinks the install goes through and writes through the link' { $script:code -eq 0 -and (Markers $notes) -eq 1 }
    Run-Child $uninst @('-Agent', 'codex', '-Project', $proj); $c2 = $script:code
    Run-Child $uninst @('-Agent', 'codex', '-Project', $proj, '-FollowLinks')
    Check 'the uninstall stops without -FollowLinks, and with it puts the file back as it was' { $c2 -eq 1 -and $script:code -eq 0 -and (Same $exp $notes) }
  }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj, $outside -Recurse -Force

  # A repository that ships backups\original\AGENTS.md as a dangling link to a file elsewhere: the first install's
  # copy of AGENTS.md is never written through it.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'codex project, a cloned backups\original\AGENTS.md that is a dangling link'
  Set-Content (Join-Path $proj 'AGENTS.md') '# repo notes'; New-Item -ItemType Directory -Force (Join-Path $proj '.makkov-harness\backups\original') | Out-Null
  $target = Join-Path $h 'profile.ps1'; $linked = $true
  try { Set-Content $target 'x'; New-Item -ItemType SymbolicLink -Path (Join-Path $proj '.makkov-harness\backups\original\AGENTS.md') -Target $target | Out-Null; Remove-Item $target } catch { $linked = $false; Write-Output '  skip (no right to create symlinks here)' }
  if ($linked) {
    $pbefore = Tree $proj
    Run-Child $inst @('-Agent', 'codex', '-Project', $proj)
    Check 'install stops (exit 1), says it is a link, creates nothing' { $script:code -eq 1 -and $script:out -match 'is a link' -and -not (Test-Path $target) -and (Tree $proj) -eq $pbefore }
  }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force

  # A repository that ships backups\original\.cursor\rules\makkov-harness.mdc: the uninstall never writes it into
  # the Cursor rule, since no install here made that copy.
  $h = New-Temp; $proj = New-Temp; $env:USERPROFILE = $h
  Write-Output 'cursor project, a cloned copy of the rule in backups\original'
  $cp = Join-Path $proj '.makkov-harness\backups\original\.cursor\rules'; New-Item -ItemType Directory -Force $cp | Out-Null
  [IO.File]::WriteAllText((Join-Path $cp 'makkov-harness.mdc'), "alwaysApply: true`nINJECTED`n")
  Run-Child $inst @('-Agent', 'cursor', '-Project', $proj); $c1 = $script:code
  Run-Child $uninst @('-Agent', 'cursor', '-Project', $proj)
  Check 'install and uninstall go through, and no rule is left behind' { $c1 -eq 0 -and $script:code -eq 0 -and -not (Test-Path (Join-Path $proj '.cursor\rules\makkov-harness.mdc')) }
  New-Item -ItemType Directory -Force (Join-Path $proj '.cursor\rules') | Out-Null; [IO.File]::WriteAllText((Join-Path $proj '.cursor\rules\makkov-harness.mdc'), "my rule`n"); $pbefore = Tree $proj
  Run-Child $inst @('-Agent', 'cursor', '-Project', $proj)
  Check 'with a rule of yours that differs from that copy, install stops (exit 1) and changes nothing' { $script:code -eq 1 -and (Tree $proj) -eq $pbefore }
  $env:USERPROFILE = $realHome; Remove-Item $h, $proj -Recurse -Force
} finally { $env:USERPROFILE = $realHome }

# Random sequences of install, update and uninstall for several agents, with interruptions: a bounded run here
# (seeded by the day, printed, so a failure can be re-run with the same seed); run more locally.
Write-Output 'random sequences'
$seqSeed = if ($env:MAKKOV_SEQ_SEED) { [int]$env:MAKKOV_SEQ_SEED } else { (Get-Date).DayOfYear }
$seqRuns = if ($env:MAKKOV_SEQ_RUNS) { [int]$env:MAKKOV_SEQ_RUNS } else { 4 }
& (Join-Path $PSScriptRoot 'test-sequences.ps1') -Runs $seqRuns -Seed $seqSeed
if ($LASTEXITCODE -eq 0) { Write-Output "  ok   random sequences (seed $seqSeed)" } else { Write-Output "  FAIL random sequences (seed $seqSeed)"; $script:fails++ }

Write-Output ''
# exit 0 explicitly: $LASTEXITCODE still holds the code of the last child run (the marker scenario's 1).
if ($script:fails -eq 0) { Write-Output 'installer tests: all passed'; exit 0 } else { Write-Output "installer tests: $($script:fails) failed"; exit 1 }
