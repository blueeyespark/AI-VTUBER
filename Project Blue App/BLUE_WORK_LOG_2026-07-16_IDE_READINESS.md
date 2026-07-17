# Project Blue IDE Readiness Upgrade — 2026-07-16

## Goal
Advance Blue toward the user's independent VS Code-class IDE ideal without another risky visual rewrite.

## Implemented

- Added `desktop_pet/ide-readiness-service.cjs`.
- Added truthful capability scoring for:
  - editor foundation
  - native terminal and tasks
  - Git workflows
  - language intelligence/LSP
  - debugging/DAP
  - testing
  - extension platform
  - Blue Workspace Agent
  - workspace-awareness context
- Added blocker detection for missing Monaco, language servers, debug adapters, native terminal verification, and placeholder UI modules.
- Added recommended next milestones based on real missing service methods.
- Added Blue Chat support for:
  - `/ide-status`
  - `/agent ide-status`
  - natural requests such as “check IDE readiness” and “how close is Blue to VS Code parity?”
- Added Electron IPC/preload exposure through `blue:ide-readiness` and `window.blue.ideReadiness()`.
- Added automated readiness tests.
- Added syntax validation for the new service.

## Verification

- JavaScript syntax checks: passed.
- Node tests: 137 passed, 0 failed.
- Python tests: 94 passed, 1 skipped.
- Skipped Python test: Windows-only DPAPI vault verification.

## Why this matters

Blue previously had many capable services but no single truthful way to measure whether the independent IDE was actually ready. The new readiness service prevents UI appearance or scaffolding from being mistaken for complete functionality and gives Blue itself a live roadmap it can report from chat.

## Remaining Windows verification

- Electron visual launch
- native node-pty terminal under the installed Electron ABI
- DPAPI secure vault
- Windows Security snapshot
- OBS and Discord live connections
- multi-monitor desktop companion behavior
