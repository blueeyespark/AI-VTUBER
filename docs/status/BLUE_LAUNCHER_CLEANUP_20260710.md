# Blue Launcher Cleanup - 2026-07-10

State: complete and verified.

## Root launchers now

- `START_BLUE.ps1` - main Project Blue desktop/control-center launcher.
- `START_BLUE.cmd` - double-clickable wrapper for `START_BLUE.ps1`.
- `DISABLE_STARTUP.cmd` - removes Project Blue startup entries from Windows Startup.

## Preserved legacy launchers

The old root launchers were moved, not deleted:

- `tools/launchers/legacy_root_launchers/open_blue.cmd`
- `tools/launchers/legacy_root_launchers/open_blue.ps1`
- `tools/launchers/legacy_root_launchers/open_blue_3d.cmd`
- `tools/launchers/legacy_root_launchers/run_blue.cmd`
- `tools/launchers/legacy_root_launchers/run_blue.ps1`
- `tools/launchers/legacy_root_launchers/disable_blue_startup.cmd`
- `tools/launchers/legacy_root_launchers/start_blue_hidden.vbs`

## Internal launchers kept in place

`Project Blue App/run_blue.ps1` and `Project Blue App/run_blue.cmd` remain in place because the Python app uses them for command-line tasks.

## Verification

- Root launcher list is simplified.
- Legacy launchers are preserved under `tools/launchers/legacy_root_launchers/`.
- Hidden startup helper was recreated at `tools/launchers/START_BLUE_HIDDEN.vbs` and now points to the current repo root.
- README and `START_PROJECT_BLUE_HERE.md` now point to `START_BLUE.ps1` / `START_BLUE.cmd`.
