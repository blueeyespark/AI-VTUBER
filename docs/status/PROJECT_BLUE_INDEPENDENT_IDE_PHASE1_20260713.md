# Project Blue Independent IDE - Phase 1 Foundation

Project Blue remains an independent Electron application. It does not embed Code-OSS, copy proprietary VS Code code, or become a VS Code extension.

## Implemented in this pass

- Workspace-confined text file opening
- Language identification for common project formats
- Editor session IDs, versions, and dirty state
- Bounded undo and redo history
- Find and replace with regex, case, whole-word, and replace-one/all options
- Explicit save through a trusted Electron IPC interface
- External file-change and deletion detection
- Save conflict response with a line-oriented diff instead of blind overwrite
- Crash-recovery snapshots for unsaved content
- Recovery cleanup after a successful save or explicit discard
- Dirty-session close protection
- Renderer bridge methods for the future Monaco/editor UI layer
- Functional workbench File Preview editor connected to the guarded service
- Workspace-relative path opening and breadcrumb display
- Visible dirty-state tab marker and save status
- Toolbar actions for save, undo, redo, compare, find, and replace
- Ctrl+S support inside the Project Blue workbench
- External-change warning shown through the Problems panel before overwrite
- Clickable real Project Files tree in the Workspace sidebar
- Bounded workspace indexing with dependency/runtime folders ignored
- Manual project-tree refresh
- Recovery snapshot chooser and restoration into a guarded dirty editor session
- Multiple simultaneously open file tabs, each with an independent guarded editor session
- Per-tab dirty indicators, state-preserving tab switching, and dirty-close confirmation
- Reopening an already open path focuses its existing tab instead of duplicating or discarding it
- Safe text-node tab labels for workspace filenames
- Two-second guarded monitoring for externally changed or deleted open files
- Automatic reload for clean tabs changed by another program
- Conflict warnings that preserve unsaved local edits instead of overwriting them
- Problems-panel reporting for deleted open files, with the tab retained for review/recovery
- VS Code-style reusable preview tab for files opened with a single click
- Double-click and tab-context pinning for files that should remain open
- Automatic pinning as soon as a preview tab receives an edit
- Italic preview-tab styling to distinguish temporary from retained editors
- Embedded open-source Monaco Editor dependency loaded locally
- Monaco syntax highlighting, line numbers, minimap, language switching, and native editor undo behavior
- Resizable two-column split editor surface
- Monaco side-by-side diff editor with dependency-free fallback output
- Breadcrumb path display for the active workspace file
- Automated Phase 1 workbench acceptance gate covering the editor, split, diff, recovery, tabs, and file monitoring wiring

## Phase 1 acceptance

Blue can open, edit, save, compare, and restore guarded project files. The editor has syntax highlighting, line numbers, find/replace, multiple preview or pinned tabs, split view, breadcrumbs, diff review, crash recovery, and external-change detection.

File monitoring uses bounded polling rather than an unbounded native watcher. This satisfies Phase 1 external-change detection while avoiding recursive watcher exhaustion on large dependency trees.

Phase 1 is complete. Phase 2 through Phase 11 remain separate roadmap gates and are not claimed complete here.

This service separates filesystem/editor behavior from presentation code so the UI and Blue Chat can use one guarded interface.
