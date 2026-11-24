# PowerShell installer on main at 51cab04

`install.ps1` and `lib.ps1` exactly as they were on main at commit 51cab04 (the installers of PR #76, before the
Node installer). `install/test/test-install.ps1` installs with them first and then updates with the current
installers, so the PowerShell fingerprints this code recorded stay recognised (a change to how ids are computed
cannot silently reclassify existing installs). Do not edit these files.
