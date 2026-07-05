# Project Blue v2.9 Installed Status

Installed: 2026-07-04  
State: **installed, synchronized, backed up, and verified**

## Expanded control center

- Named conversation creation and switching
- Persistent conversation history selection
- Startup resumes the existing desktop conversation without creating duplicates
- Dedicated Discord workspace
- Pending approval inspection
- Recent audit-event inspection
- Existing chat, paste, file, image, folder, OCR, voice, presence, movement,
  creation lab, diagnostics, and OBS controls preserved

## Discord add-on

- Guild-scoped `/blue status` and `/blue ask`
- Configured guild/channel restriction and optional user allowlist
- Ephemeral responses with user and role mentions suppressed
- 1,500-character input and 1,900-character output bounds
- Bot token held in memory only and cleared on disconnect
- Only the `GUILDS` Gateway intent is requested
- Ordinary Discord messages are not read
- Add-on starts disabled and disconnected
- The private `Blue Discord` conversation is created once, on first use
- No token was used during installation

## Verification

- Python regression tests: 88 passed
- Desktop tests: 18 passed
- Total automated tests: 106 passed
- JavaScript syntax checks: passed
- Temporary Electron UI smoke test: passed
- Permanent Electron UI smoke test: passed
- Installed/staging v2.9 manifest: 36/36 entries valid
- Permanent desktop version: 1.9.0
- Staging desktop version: 1.9.0
- New external dependencies: none
- Discord configuration file absent after installation
- Minecraft project received no Blue files

## Backup

Verified backup directory:

`C:\Users\adahn\Downloads\ai blue project\Project Blue App\release_backups\v2.9.0-discord-control-20260704-095044`

- Database checksum match: true
- SQLite integrity check: `ok`
- Previous permanent files: preserved
- Previous staging files: preserved
- Installed SHA-256 manifest: written and independently rechecked
- Historical backups: untouched

Vision, background microphone listening, automatic screen capture, and the
Discord add-on remain off until explicitly activated by the user.
