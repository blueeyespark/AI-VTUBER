# Project Blue Launchers

Use the root launcher first:

```powershell
.\START_BLUE.ps1
```

or double-click:

```text
START_BLUE.cmd
```

## Root launchers

- `START_BLUE.ps1` - main Project Blue desktop/control-center launcher.
- `START_BLUE.cmd` - double-clickable wrapper for `START_BLUE.ps1`.
- `DISABLE_STARTUP.cmd` - removes Project Blue startup entries from Windows Startup.

## Internal launchers

`Project Blue App\run_blue.ps1` and `Project Blue App\run_blue.cmd` are app-internal Python command launchers. Keep them where they are.

## Legacy launchers

Old root launchers were moved to `tools/launchers/legacy_root_launchers/` so they are preserved but no longer clutter the project root.

## Hidden startup helper

`tools/launchers/START_BLUE_HIDDEN.vbs` starts `START_BLUE.cmd` without a visible console window. If startup is enabled later, point Windows Startup at this helper or a shortcut to it.
