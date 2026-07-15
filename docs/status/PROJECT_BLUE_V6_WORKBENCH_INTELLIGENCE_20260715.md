# Project Blue V6 Workbench Intelligence

Date: 2026-07-15  
State: installed and regression-tested

## Outcome

V6 keeps the current IDE shell and deepens the services behind it. Blue now has a durable, privacy-bounded understanding of the active workbench instead of treating the editor, Git, tests, terminal, and chat as unrelated tools.

## Added in this pass

### Workbench Context Service

`workbench-context-service.cjs` aggregates:

- active activity, editor, conversation, and current file supplied by the renderer;
- recent editor files and trusted workspace roots;
- configured tasks and active terminal sessions;
- Git branch, changes, staging, and conflicts;
- language-server and diagnostic state;
- recent test runs;
- debugger and extension state;
- optional streaming, Discord, BlueMesh, and presence adapters;
- a bounded local activity timeline.

The context store lives under ignored `.blue` runtime state. Credential-like keys are redacted, `.env`, `.git`, and dependency paths are suppressed, strings and collections are bounded, and service failures degrade to an explicit unavailable state instead of breaking Blue Chat.

### Proactive Blue Service

`proactive-blue-service.cjs` observes workbench events and creates bounded suggestions for:

- project open with unfinished Git work;
- successful Git pulls;
- failed tasks;
- failed test runs;
- changed diagnostics;
- idle work with uncommitted changes;
- streaming preflight with a disconnected provider.

Suggestions are deduplicated by cooldown, dismissible, stored locally, and never execute an action automatically. Existing approval boundaries still control tasks, edits, Git mutations, streaming, and sensitive operations.

### Blue Chat integration

The Workspace Agent supports:

- `/agent context`
- `/agent activity`
- `/agent suggestions`
- natural requests such as `summarize my workbench`, `what am I working on`, and `what should I do next?`

Context and suggestion APIs are also exposed to the renderer through the existing trusted IPC bridge, so the current workbench can consume them without introducing another page or dashboard.

### Advanced reviewed Git workflows

The Git service now supports:

- stash listing, creation, and apply;
- merge with conflict reporting;
- cherry-pick with conflict reporting;
- revert with conflict reporting;
- bounded line blame;
- strict reference validation.

Every mutating operation requires explicit approval. Merge, stash apply, cherry-pick, and revert refuse to start over unrelated working-tree changes. Conflicts are returned as state for creator review instead of being silently overwritten or automatically discarded.

Blue Chat entry points:

- `/agent stashes`
- `/agent stash <message> APPROVE`
- `/agent apply-stash stash@{0} APPROVE`
- `/agent merge <branch> APPROVE`
- `/agent cherry-pick <commit> APPROVE`
- `/agent revert <commit> APPROVE`
- `/agent blame <workspace-relative-file>`

## Existing V6 foundation verified

The repository already contained tested services for:

- real workspace indexing, file watching, multi-root workspaces, symbols, references, search, and replace previews;
- editor sessions, dirty state, undo/redo, safe saves, external conflict checks, and recovery;
- persistent PTY terminals and tasks;
- Git status, diff, stage, commit, branch, history, pull, push, and attribution;
- language servers, diagnostics, completion, hover, definitions, references, rename, formatting, semantic tokens, and workspace edits;
- DAP-based Node and Python debugging;
- test discovery, execution, history, failure navigation, and debug configuration;
- approval-gated extension lifecycle and isolated extension commands;
- Workspace Agent proposal, diff, approval, apply, and guarded rollback;
- streaming platform catalogs, OBS planning, moderation, preflight, and adult-platform readiness gates;
- Discord, BlueMesh, voice, presence, memory, and desktop companion foundations.

## Honest remaining roadmap

These V6 ambitions are not claimed complete:

- semantic repository search beyond textual and symbol indexes;
- full graphical merge editor and three-way conflict UI;
- richer debugger watch expressions, conditional breakpoint UI, and multi-session UX;
- remote/cloud extension marketplace and sandbox hardening beyond the local host;
- continuous renderer publication of every context event (the IPC and chat paths are ready; UI consumption can deepen incrementally);
- fully autonomous code generation or deployment. Sensitive mutations remain approval-gated by design.

## Verification

- syntax check includes both new services;
- focused context/proactive/Workspace Agent tests: 10 passed;
- focused advanced Git/Workspace Agent tests: 11 passed;
- complete Project Blue desktop suite after the V6 implementation: 125 passed;
- no `.env`, token, password, credential, or private key data is persisted by the new services;
- prior main process, preload bridge, Workspace Agent, package manifest, and Git service are preserved in the local ignored backup folder `Project Blue App/backups/v6-workbench-context-20260715`.
