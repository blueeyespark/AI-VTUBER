# Project Blue v2.6 Installed Status

Installed: 2026-07-04  
State: **installed, backed up, and verified**

## Local voice input

- `Listen Once` uses the installed Windows offline speech recognizer.
- Listening begins only after the user presses the button.
- Listening stops automatically after at most eight seconds.
- Blue displays `Presence: listening` and `Microphone: listening`.
- The transcript is placed in the message box for review.
- Blue never sends recognized speech automatically.
- The activity timeline never stores transcript text.
- Background microphone listening remains off.

Detected recognizer:

`en-US | Microsoft Speech Recognizer 8.0 for Windows (English - US)`

## Verification

- Python regression tests: 88 passed
- Desktop tests: 12 passed
- Total automated tests: 100 passed
- JavaScript and PowerShell syntax checks: passed
- Offline recognizer self-test: passed
- Staged Electron smoke test: passed
- Permanent Electron smoke test: passed
- Full-body and control-panel screenshots: passed
- Desktop-pet package: 1.6.0
- Microphone was not opened by automated tests

## Backup

Verified backup directory:

`C:\Users\adahn\Downloads\ai blue project\Project Blue App\release_backups\v2.6.0-voice-20260704-083225`

- Database checksum match: true
- SQLite integrity check: `ok`
- Previous app files: preserved
- Installed SHA-256 manifest: written
- Historical backups: untouched

Automatic screen capture and background microphone listening remain off.
