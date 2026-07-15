# Project Blue V4 AI IDE Pass

Date: 2026-07-13

## Goal

Convert the current Project Blue Control Center presentation layer toward a true AI IDE/workbench model without removing existing backend handlers or Project Blue features.

## Completed in this pass

- Created a backup of the current UI files in `Project Blue App/desktop_pet/_ui_backup_20260713_v4_ai_ide`.
- Expanded the shell activity model toward the V4 AI IDE layout:
  - Workspace
  - Explorer
  - Search
  - Git
  - Run
  - Streaming
  - BlueMesh
  - Research
  - Generator
  - Settings
  - Extensions
  - Diagnostics
  - AI & Presence and Discord preserved so existing features keep a visible home.
- Re-homed legacy page-style panels into editor-style activities:
  - Research and idea tools now belong to the Research activity.
  - Generated results and animation/generator placeholders now belong to the Generator activity.
  - Security, tools, developer diagnostics, autonomy, approvals, artifacts, and PC actions now belong to Diagnostics.
  - Source control is now Git.
- Added V4 editor placeholders for:
  - Blueprint Editor
  - Asset Generator
  - Animation Generator
  - Diff Review
  - Terminal Editor
  - Explorer workspace home
- Updated legacy route normalization so old routes land in their new V4 activities instead of breaking.
- Updated the control audit expected placement map to match the V4 workbench architecture instead of the old dashboard activity names.
- Preserved existing Blue chat, AI, Discord, Streaming, BlueMesh, security, diagnostics, and companion backend wiring.

## Verification

- `npm.cmd run check` passed in `Project Blue App/desktop_pet`.
- `npm.cmd test` passed in `Project Blue App/desktop_pet`: 53/53 tests.
- `python -m unittest discover -s tests -p 'test_*.py'` passed with `PYTHONPATH=src`: 26/26 tests.

## Notes

This pass completes the V4 routing and shell migration foundation. It is not the final visual polish pass. The next best step is to continue replacing the remaining legacy panel markup with smaller reusable workbench components while keeping the green audit and test suite intact after each migration.