# Project Blue v2.8 Installed Status

Installed: 2026-07-04
State: **installed, synchronized, backed up, and verified**

## Local image text scanning

- `Scan Image Text Locally` uses Windows.Media.Ocr.
- Images are selected explicitly; Blue does not watch the screen.
- No image or OCR result is uploaded.
- Results appear in a review-only box.
- `Use OCR Text in Paste Box` keeps text editable.
- OCR text is never automatically sent.
- Observation records preserve provider and scan provenance.

## Verification

- Full moved-workspace re-audit: 4,490/4,490 files valid
- Prior installed v2.7 audit: 15/15 files valid
- Python regression tests: 88 passed
- Desktop tests: 14 passed
- Total automated tests: 102 passed
- Installed/staging v2.8 manifest: 32/32 entries valid
- Permanent desktop version: 1.8.0
- Staging desktop version: 1.8.0
- Installed OCR functional test: 390 characters, 19 lines, en-US
- Permanent Electron smoke test: passed
- Minecraft residual Blue items: zero

## Backup

Verified backup directory:

`C:\Users\adahn\Downloads\ai blue project\Project Blue App\release_backups\v2.8.0-local-ocr-20260704-092714`

- Database checksum match: true
- SQLite integrity check: `ok`
- Permanent v2.7 files: preserved
- Staging v2.7 files: preserved
- Installed SHA-256 manifest: written
- Historical backups: untouched

Vision, background microphone listening, and automatic screen capture remain
off.
