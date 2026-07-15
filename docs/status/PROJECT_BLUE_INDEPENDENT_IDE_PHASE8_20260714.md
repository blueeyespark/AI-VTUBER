# Project Blue Independent IDE — Phase 8

Date: 2026-07-14

Status: implemented and verified

## First-class testing workbench

Project Blue now treats tests as structured workbench objects instead of plain terminal commands. The Run activity opens a Test Explorer with a compact workspace tree, test-file grouping, selectable tests, results, output, and persistent run history.

Implemented capabilities:

- bounded workspace discovery for Node.js/TypeScript `test` and `it` cases
- Python `unittest` discovery for `TestCase` methods
- run one selected test
- run every test in a selected file
- run all discovered workspace tests
- debug a selected test through Phase 7's Debug Adapter Protocol service
- persistent result history in `.blue/testing/history.json`
- source file and line metadata for every result
- click-through failed-test navigation into Project Blue's editor
- live stdout/stderr delivery through the guarded Electron bridge
- child-process isolation when Project Blue's own suite launches nested Node tests

Coverage collection remains explicitly deferred by the roadmap.

## Verification

Automated Phase 8 service tests verify mixed Node/Python discovery, single/file/all execution, persistent history, deliberate failure detection, source navigation metadata, and generated debugger configuration. The permanent control-route audit verifies every visible control and IPC bridge.

