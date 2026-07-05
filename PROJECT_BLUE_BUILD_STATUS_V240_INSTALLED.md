# Project Blue v2.4 Installed Status

Installed: 2026-07-04  
State: **installed, backed up, and verified**

## Presence and movement

- Unified desktop and VRM presence state
- Persistent Off, Quiet, Balanced, and Social proactivity
- Off mode disables spontaneous movement and renderer gestures
- Queued gesture blending
- Walk, run, wave, smile, look, nod, cheer, lean, stretch, and dance
- Smooth randomized blinking
- Increased but bounded hair and tail follow-through
- Full-body roaming across Windows displays
- OBS-compatible pet window remains available

## Control and privacy

- Live Presence, Vision, Microphone, and Auto-capture indicators
- Automatic screen capture is off
- Vision is off
- Microphone capture is off
- Local activity timeline without chat-content storage
- Manual-share Observation History
- Individual and clear-all observation metadata controls
- Bounded observation and activity retention
- Component health, uptime, memory, and recovery status

## Reliability

- Pet renderer bounded recovery: at most three attempts per minute
- Control-panel renderer recovery
- Electron state and cache stored under Blue's local `.blue` directory
- No runtime errors in the final permanent launch

## Verification

- Python regression tests: 88 passed
- Desktop presence/privacy tests: 5 passed
- Desktop JavaScript syntax checks: passed
- Staged Electron smoke test: passed
- Permanent Electron smoke test: passed
- Desktop-pet package: 1.4.0

Permanent smoke artifacts:

- `C:\Users\adahn\Downloads\minecraft butchery project\_BLUE_V24_PERMANENT_SMOKE\blue-pet-smoke.png`
- `C:\Users\adahn\Downloads\minecraft butchery project\_BLUE_V24_PERMANENT_SMOKE\blue-control-smoke.png`

## Backup

Verified backup directory:

`C:\Users\adahn\Downloads\ai blue project\Project Blue App\release_backups\v2.4.0-presence-20260704-080853`

Database backup:

`blue-before-v2.4.0.db`

Backup verification:

- SHA-256 checksum match: true
- SQLite integrity check: `ok`
- Previous application files: preserved
- Installed-file SHA-256 manifest: written
- Historical backups: untouched
