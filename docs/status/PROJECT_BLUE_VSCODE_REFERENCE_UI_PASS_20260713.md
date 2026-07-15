# Project Blue VS Code Reference UI Pass - 2026-07-13

## Completed in this pass

- Backed up current desktop UI files to `Project Blue App/desktop_pet/_ui_backup_20260713_vscode_reference`.
- Added the missing VS Code-style persistent right auxiliary region for Blue Chat.
- Moved the existing wired Blue Chat DOM into the auxiliary rail at runtime so existing chat, files, OCR, voice, paste, and conversation handlers remain connected.
- Kept the central editor group for workspace files/tools instead of using Blue Chat as a giant center page.
- Added a Workspace home editor explaining that files, research, ideas, diagnostics, and generated results open in editor tabs while Blue Chat stays docked at right.
- Expanded the activity bar registry toward the reference layout:
  - Overview
  - Explorer
  - Search
  - Source Control
  - Run and Tasks
  - Extensions and Skills
  - Blue Memory
  - AI & Presence
  - Tools
  - Streaming
  - Discord
  - BlueMesh
  - Systems
  - Settings
- Added static route entries for those activities so the control audit can prove every panel has a navigation home.
- Added placeholder editor panels for Search, Source Control, Run/Tasks, Extensions/Skills, and Blue Memory so the shell can route like a workbench before deeper feature migration.
- Added Terminal and Tests tabs to the bottom panel.
- Updated CSS grid from three columns to four persistent workbench columns: activity bar, sidebar, editor group, auxiliary Blue Chat.

## Verification

- Desktop syntax check passed: `npm.cmd run check`.
- Desktop test suite passed: 52/52 tests.
- Root Python suite passed: 26/26 tests.

## Remaining UI migration work

- Replace placeholder Search, Source Control, Run/Tasks, Extensions, and Memory editors with full wired feature views.
- Add true sidebar resizing and auxiliary resizing handles.
- Add visual screenshot verification at 1366x768, 1600x900, 1920x1080, and 2560x1440.
- Continue removing old page-specific CSS once every feature has been migrated into reusable workbench components.
- Add optional central Blue Chat tab later if desired, while keeping the right auxiliary chat as the default Codex-style panel.