# Project Blue v2.7 Installed Status

Installed: 2026-07-04  
State: **installed, restarted cleanly, backed up, and verified**

## Control panel

- Chat opens first.
- Persistent tabs: Chat, Presence, Create, Motion, and System.
- Live privacy and presence indicators remain visible across tabs.
- Listen Once and Send fit beside the chat input.
- Paste Clipboard works only after an explicit click.
- Clipboard and voice contents are not stored in the activity timeline.

## Voice reliability

- Listen Once can be cancelled with Stop Listening.
- Cancellation terminates the bounded local recognizer process.
- Background microphone listening remains off.
- Recognized text remains editable and is never automatically sent.

## Installed-only issue found and resolved

Four Project Blue Electron processes from the previous day were still running
from an older build. The first installed screenshot reached that obsolete
renderer and produced a black control-panel capture. Only Electron processes
whose executable path exactly matched Project Blue were stopped. A clean v2.7
restart then produced a correct permanent control-panel and full-body capture.

## Verification

- Python regression tests: 88 passed
- Desktop tests: 13 passed
- Total automated tests: 101 passed
- Staged visual test: passed
- Clean permanent visual test: passed
- Offline recognizer self-test: passed
- Desktop-pet package: 1.7.0

## Backup

Verified backup directory:

`C:\Users\adahn\Downloads\ai blue project\Project Blue App\release_backups\v2.7.0-control-20260704-090242`

- Database checksum match: true
- SQLite integrity check: `ok`
- Previous files: preserved
- Installed SHA-256 manifest: written
- Historical backups: untouched

Clean permanent screenshots:

- `C:\Users\adahn\Downloads\minecraft butchery project\_BLUE_V27_PERMANENT_SMOKE_RESTARTED\blue-control-smoke.png`
- `C:\Users\adahn\Downloads\minecraft butchery project\_BLUE_V27_PERMANENT_SMOKE_RESTARTED\blue-pet-smoke.png`
