# Project Blue Workbench Behavior Pass - 2026-07-13

State: implemented and test-verified.

This pass continues the VS Code-style shell without replacing it again. It turns the visual shell into a more functional workbench.

## Completed

- Bottom panel now resets closed by default for this behavior version.
- Added bottom-panel collapse control.
- Added persisted layout variables for sidebar width, Blue Chat width, and bottom panel height.
- Added resize handles for:
  - primary sidebar / editor
  - editor / Blue Chat auxiliary panel
  - editor / bottom panel
- Blue Chat auxiliary panel defaults wider and has compact New/Delete icon controls.
- Blue Chat composer remains docked at the bottom of the auxiliary panel while messages scroll.
- Fixed Activity Bar metadata safety so missing icons cannot render `undefined`.
- Fixed the missing Tools SVG icon.
- Added startup validation/test for activity metadata: id, label, tooltip, svgIcon, and sidebarView.
- Startup workspace editor list now opens only the Workspace home by default; Research no longer auto-opens.
- Added real workbench hooks for:
  - Workspace file tree via BlueWorkspaceAgent `/files`
  - Search via `workspaceSearch`
  - Source Control via `workspaceGit`
- Added first-class wired controls for Search and Refresh Git State so the control audit sees them.
- Added Terminal and Tests bottom-panel targets from Run/Tasks.

## Verification

- `npm.cmd run check` passed.
- `npm.cmd test` passed: 53/53 tests.
- Root Python suite passed: 26/26 tests.

## Still needs visual/live pass

- Launch the Electron app and inspect at 1366x768, 1600x900, and 1920x1080.
- Capture a 1920x1080 screenshot after restart/reload.
- Improve actual file preview line-jump and double-click pin behavior.
- Add richer Source Control actions for stage/unstage/commit/pull/push with approval gates.
- Add command parser actions from Blue Chat into workbench regions beyond the existing workspace-agent routing.