# Project Blue Independent IDE - Phase 4 Complete

Project Blue now has an independent terminal and task service inside its Electron workbench. Terminal logic remains behind trusted IPC and is not implemented directly in renderer event handlers.

## Implemented

- Real Windows pseudoterminals through `node-pty` and ConPTY
- PowerShell, Command Prompt, Git Bash, and Python terminal profiles with availability detection
- Persistent terminal processes that remain alive while users change editor tabs
- Up to twelve simultaneous sessions with individual tabs
- Two-pane split terminal view
- Workspace-relative working-directory selection and escape protection
- Live PTY output events with bounded one-megabyte scrollback per session
- Interactive input, Ctrl+C cancellation, resize IPC, explicit kill, process IDs, states, and exit codes
- Locally persisted task definitions
- Normal, build, test, and background task types
- Built-in Project Blue syntax-check and test tasks
- Task execution supervised through real terminal sessions
- Native ConPTY smoke test plus deterministic service and workbench acceptance tests

## Safety boundaries

- Terminal working directories must remain inside the registered Project Blue repository root.
- Renderer code cannot spawn processes directly.
- Terminal input is explicit and interactive; Project Blue does not silently copy secrets into tasks.
- Task definitions contain commands and nonsecret metadata only.
- All terminal processes are closed during Project Blue shutdown.

## Acceptance status

**Phase 4 is complete.** Blue can run and supervise real project commands, show live output, retain multiple interactive sessions, cancel them, report exit codes, and execute saved build, test, or background tasks.
