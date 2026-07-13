# Start Project Blue Here

Project Blue has two main areas:

- `Project Blue App` - the executable local AI companion, control center, and desktop avatar.
- `Project Blue Data Center` - the organized source of truth, engineering plan, status, research, and roadmap.

## Start Blue normally

From this repository root, run:

```powershell
.\START_BLUE.ps1
```

Or double-click:

```text
START_BLUE.cmd
```

That is the main launcher for the desktop/control-center app.

## Disable startup

If Blue is starting with Windows and you want to turn that off, run:

```text
DISABLE_STARTUP.cmd
```

## Command-line tools

The app-internal command launchers still live in `Project Blue App/`:

```powershell
cd "Project Blue App"
.\run_blue.cmd status
.\run_blue.cmd chat "What can you do right now?"
.\run_blue.cmd doctor
```

## Launcher organization

Old root launchers were moved to `tools/launchers/legacy_root_launchers/` as backups. The root now uses the clearer launcher names above.
