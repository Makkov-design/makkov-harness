<#
  End-to-end test of install.ps1 and uninstall.ps1, in throwaway homes and projects (never your own).
  Each block states one behaviour the installers promise; install/test/test-install.sh checks the same
  behaviours for install.sh / uninstall.sh.
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
function New-HarnessCopy { $d = New-Temp; Copy-Item (Join-Path $repo 'install'), (Join-Path $repo 'skills'), (Join-Path $repo 'ROUTING.md') $d -Recurse; $d }
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
  Check 'your notes and your later edit kept, block gone' { [IO.File]::ReadAllText($mine) -eq "# my notes`n`n# added later`n" }
  Check 'no harness folder left' { -not (Test-Path (Join-Path $h '.makkov-harness')) }
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
    Check 'still a symlink after the install' { ((Get-Item $link -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -and (Markers $target) -eq 1 }
    & $inst -Agent codex -Project $proj -Scope design | Out-Null
    Check 'still a symlink after an update that rewrites the block' { ((Get-Item $link -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -and [bool]((Get-Content $target) | Where-Object { $_ -like 'Scope: design*' }) }
    & $uninst -Agent codex -Project $proj | Out-Null
    Check 'still a symlink after the uninstall' { (Get-Item $link -Force).Attributes -band [IO.FileAttributes]::ReparsePoint }
    Check 'the file back as it was after the uninstall' { Same $exp $target }
    if (-not (Same $exp $target)) { Write-Output ('    expected: ' + (Bytes $exp)); Write-Output ('    got:      ' + (Bytes $target)); Write-Output ('    link:     ' + (Get-Item $link -Force).Attributes) }
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
  $src = New-HarnessCopy; $sInst = Join-Path $src 'install\install.ps1'; $sUninst = Join-Path $src 'install\uninstall.ps1'
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
  $src = New-HarnessCopy; $sInst = Join-Path $src 'install\install.ps1'; $sUninst = Join-Path $src 'install\uninstall.ps1'
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
} finally { $env:USERPROFILE = $realHome }

Write-Output ''
if ($script:fails -eq 0) { Write-Output 'installer tests: all passed' } else { Write-Output "installer tests: $($script:fails) failed"; exit 1 }
