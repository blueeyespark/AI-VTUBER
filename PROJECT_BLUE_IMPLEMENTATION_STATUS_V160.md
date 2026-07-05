# Project Blue v1.6 Installed Status

Installed: 2026-07-03  
State: **running and verified**

## Desktop architecture

- Independent transparent roaming pet window
- Resizable and minimizable control panel
- System-tray access when the panel is hidden
- Multi-monitor virtual-desktop wandering with edge bounce
- Wandering pauses while the pointer is over Blue
- OBS-compatible window title: `Blue 3D Pet - OBS Capture`

## Model repairs

- Main outfit only; conflicting alternate clothing layers hidden
- Natural standing pose
- Stable bounded manual hair and tail motion replacing unstable spring simulation
- 2.5 mm Blender top clearance plus runtime top clearance to prevent body clipping
- Corrected source: `assets\avatar_source\working\Blue_Normal_Clothed.blend`

## Sharing and PC help

- Links, multiple files, images, and folders
- Text sources become searchable evidence
- Folders are registered and indexed read-only
- Other files are preserved in `.blue\shared_inbox`
- Blue Doctor and Project Blue folder access are available from the control panel
- Project mutations remain approval-gated

## Startup and OBS

Blue starts at Windows login through:

`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Project Blue 3D.vbs`

Run `disable_blue_startup.cmd` from the `ai blue project` folder to opt out.

For OBS, add a Window Capture source and select:

`Blue 3D Pet - OBS Capture`

## Verification

- 83 Python tests passed
- Desktop JavaScript checks passed
- Offline dependency audit: 0 vulnerabilities
- Database integrity and audit chain: healthy
- v1.6 backup checksum: valid
- v1.6 isolated restore drill: passed
- Required database tables: 39
