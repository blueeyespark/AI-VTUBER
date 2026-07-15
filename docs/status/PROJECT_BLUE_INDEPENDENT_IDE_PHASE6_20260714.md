# Project Blue Independent IDE — Phase 6

Date: 2026-07-14  
State: complete and verified

## Outcome

Project Blue now has a guarded Language Server Protocol client backed by real, project-local language servers:

- Python: Pyright 1.1.411
- JavaScript and TypeScript: typescript-language-server 5.3.0 with TypeScript 5.9.3

The editor exposes completion, hover information, signature help, definitions, references, symbol rename, formatting, code actions, semantic tokens, document symbols, workspace symbols, and live diagnostics.

## Safety and persistence

- Language servers are confined to the Project Blue workspace.
- Applying a multi-file server edit requires explicit approval.
- `.env`, `.git`, and `node_modules` targets are rejected.
- Approved edits receive timestamped backups under `Project Blue App/.blue/lsp-backups`.
- Server processes shut down cleanly with the desktop application.

## User interface

The file editor includes a compact Language Intelligence toolbar and result area. Python, JavaScript, and TypeScript files automatically start their matching server. Diagnostics are translated into Monaco markers. Rename shows a preview and confirmation before writing files.

## Verification

Automated tests launch both real server processes and verify that they initialize, open files, analyze source, answer symbol requests, and return hover information. Separate tests verify edit ordering, approval gates, workspace confinement, and backup creation.

Phase 6 acceptance is also enforced by the Control Center route/wiring suite so missing controls, IPC handlers, bridges, or dependencies fail the build.
