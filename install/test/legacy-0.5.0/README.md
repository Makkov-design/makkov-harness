# Installer 0.5.0, as released

`install.sh` and `install.ps1` exactly as they shipped in 0.5.0 (commit b298cd2). The installer tests install with
them first and then update and uninstall with the current scripts, so a manifest written by a released version keeps
working. Do not edit these files; add a new folder when a later manifest format needs the same check.
