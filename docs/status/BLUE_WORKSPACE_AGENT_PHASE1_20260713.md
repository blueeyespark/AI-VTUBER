# BlueWorkspaceAgent Phase 1 — Read-Only Workspace Brain

Installed: 2026-07-13

## What this builds

Blue Chat now has a real read-only workspace-agent foundation. The goal is to let Blue inspect, understand, search, map, and plan work inside the current Project Blue repository before any future approval-gated editing layer is added.

## New package

`src/blue_workspace/`

Main service:

- `BlueWorkspaceAgent`

Phase 1 tools:

- workspace context detection
- directory tree listing
- safe file reading
- file-name search
- code text search
- symbol search
- Git status
- diagnostics placeholder
- task planning in Plan Mode
- command/path/secret safety policies

## Electron bridge

`Project Blue App/desktop_pet/workspace-agent.cjs`

Exposed through preload:

- `workspaceAgent(command)`
- `workspaceContext()`
- `workspaceSearch(query)`
- `workspaceSymbols(query)`
- `workspaceGit()`

Blue Chat now routes these safe commands to the agent:

- `/workspace`
- `/files`
- `/search <phrase>`
- `/symbols <name>`
- `/git`
- `/diagnostics`
- `/plan <request>`

It also recognizes common natural-language requests such as explaining the project, checking Git status, and searching all files.

## Safety boundary

This phase is read-only. It does not edit files, install packages, run destructive commands, push to GitHub, or change secrets. File writes, patches, diffs, rollback, and command execution are intentionally left for the next approval-gated phases.

## Next phases

1. Safe editing: proposed patches, diff review, snapshots, rollback.
2. Commands and verification: integrated terminal, tests, builds, function audit output.
3. Full task workflow: bounded multi-step execution, approvals, task persistence.
4. Git workflow: branch, stage, commit, pull/push with explicit approval.
