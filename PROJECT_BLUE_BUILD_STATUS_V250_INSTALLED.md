# Project Blue v2.5 Installed Status

Installed: 2026-07-04  
State: **installed, backed up, and verified**

## Reliability and security fixes

- One Blue desktop instance is allowed at a time.
- Duplicate launches restore the existing Blue windows.
- Python helpers have a 45-second timeout and 2 MiB output limit.
- Shared-file copying and image hashing no longer block on whole-file reads.
- Shared paths, links, and chat messages receive bounded validation.
- Credential-bearing links are rejected.
- Desktop IPC only accepts Blue's own pet and control windows.
- New windows, renderer navigation, and webview attachment are blocked.
- Pet and control renderer recovery are rate-limited.
- Shutdown clears all wandering and recovery timers.

## Verification

- Python regression tests: 88 passed
- Desktop tests: 11 passed
- Total automated tests: 99 passed
- Desktop JavaScript checks: passed
- Staged Electron launch: passed
- Permanent Electron launch: passed
- Staged duplicate-instance test: passed
- Permanent duplicate-instance test: passed
- Duplicate launch redirection event: verified
- Full-body screenshot: passed
- Desktop-pet package: 1.5.0

## Backup

Verified backup directory:

`C:\Users\adahn\Downloads\ai blue project\Project Blue App\release_backups\v2.5.0-hardening-20260704-081915`

Backup verification:

- SHA-256 checksum match: true
- SQLite integrity check: `ok`
- Previous application files: preserved
- Installed SHA-256 manifest: written
- Historical release backups: untouched

Permanent smoke artifacts:

- `C:\Users\adahn\Downloads\minecraft butchery project\_BLUE_V25_PERMANENT_SMOKE\blue-pet-smoke.png`
- `C:\Users\adahn\Downloads\minecraft butchery project\_BLUE_V25_PERMANENT_SMOKE\blue-control-smoke.png`

Vision, microphone capture, and automatic screen capture remain off.
