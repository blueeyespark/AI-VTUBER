# Project Blue VS Code Workbench Audit — 2026-07-14

## Official patterns reviewed

- VS Code workbench architecture: Activity Bar, Primary Sidebar, Editor, Panel, and Status Bar.
- Activity Bar containers and context-sensitive sidebar views.
- Editor tabs, preview/pin/close behavior, and editor action placement.
- Custom layout, persistent layout state, and resizable workbench regions.
- Keyboard navigation and accessibility for workbench regions and tab lists.
- Terminal, task, output, and problems panel behavior.

## Defects found in Blue

1. Research and Generator were still separate Activity Bar destinations, conflicting with Blue's single-Workspace design.
2. Thirteen Activity Bar containers made durable destinations and contextual tools indistinguishable.
3. Sidebars were rendered as long flat lists rather than a small number of related views.
4. All bottom-panel tabs shared one `<pre>` element. Selecting a tab erased the previous tab's content.
5. The activity-log workspace watcher referenced an undeclared `bottomPanelActivity` variable.
6. The control audit still classified migrated research controls under the retired Research destination.
7. Long project filenames could force a horizontal scrollbar in the Explorer sidebar.

## Repairs installed

- Moved Research Lab, Idea Lab, Blueprint Editor, Generated Result, Asset Generator, and Animation Generator into Workspace editor tabs.
- Removed Research and Generator from the Activity Bar while preserving their routes through compatibility normalization.
- Added purpose-based sidebar groups for every visible activity.
- Added eight persistent, accessible bottom-panel views: Output, Problems, Activity, Security, BlueMesh, Streaming, Terminal, and Tests.
- Added keyboard selection and `aria-selected` state to bottom-panel tabs.
- Routed workspace watcher and file-conflict messages to their correct panel buffers.
- Updated the function-placement audit for the consolidated Workspace.
- Clipped and ellipsized long filenames in the Explorer.
- Added a regression test for consolidated Workspace ownership, grouped sidebars, and persistent panel buffers.

## Verification

- `npm.cmd run check`: passed.
- `npm.cmd test`: 118/118 passed.
- Electron startup: passed.
- 1920×1080 Workspace visual smoke: passed.
- 1920×1080 Streaming Studio visual smoke: passed.

## Future improvements

- Replace the tab-action prompt with a native in-app context menu.
- Add drag-and-drop editor-tab reordering and editor groups.
- Add panel badges/counts for Problems, Tests, and source control.
- Add narrower-window visual smoke captures at 1366×768 and 1600×900.
- Make the auxiliary Blue Chat panel default-collapsed on narrow displays while preserving user preference.
