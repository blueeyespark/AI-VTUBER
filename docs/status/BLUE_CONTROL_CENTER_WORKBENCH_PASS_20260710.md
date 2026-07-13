# Blue Control Center Workbench Pass

Date: 2026-07-10

## Goal

Move Project Blue's Control Center toward a VS Code-style workbench instead of scattered experimental tabs.

## Built

- Kept one outer Activity Bar for major workspaces.
- Added editor-tab strips across Overview, Chat, Create/Research, Companion, Discord, BlueMesh, and System.
- Turned the remaining old panels into document-style workbench panels.
- Kept the Chat Explorer visible at normal desktop widths instead of collapsing into a giant card.
- Compacted the Chat hero, message log, composer, and tool rows so the page reads more like an editor workbench.
- Increased the default Control Center width to fit the Activity Bar + Explorer + editor layout.
- Rebuilt the control shell around the VS Code workbench model: compact title/header, Activity Bar, Explorer, editor tabs, editor body, bottom status bar.
- Prevented the desktop pet from floating over the Control Center while the Control Center is focused.
- Added a final visual polish layer so the Control Center feels like a finished Blue app rather than a debug prototype:
  - fixed clipped Activity Bar buttons
  - improved spacing, contrast, borders, and hover states
  - softened the header, status chips, Explorer, editor tabs, chat log, and composer
  - kept every existing control and bridge function wired
- Continued the final Control Center polish:
  - removed the native browser tooltip from the chat log
  - widened and cleaned the Activity Bar
  - improved the header, command search, Explorer, chat hero, messages, composer, tool rows, and status bar
  - kept all 194 visible controls identified and wired
- Kept Chat as the main command surface for talking, attaching, OCR, idea capture, learning requests, research handoff, and agent planning.
- Kept sensitive PC/security/developer actions in System & Safety instead of hiding them behind a random developer-tools toggle.
- Rewired the app menu's “Run diagnostics in Chat” command to the current Chat audit button.

## Verified

- `npm.cmd run check` passed in `Project Blue App\desktop_pet`.
- `npm.cmd test` passed: 31/31.
- Control audit passed:
  - 7 panels
  - 194 visible controls
  - 194 identified controls
  - 0 missing panels
  - 0 orphan panels
  - 0 anonymous controls
  - 0 issues

## Notes

The UI now uses the same workbench pattern everywhere, but deeper future work should make the editor tabs switch sub-documents inside each workspace instead of all related documents appearing in one scroll.

Reference model: Visual Studio Code's User Interface documentation for Activity Bar, Side Bar, Editor, Panel, and Status Bar layout.
