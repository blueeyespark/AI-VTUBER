# Project Blue Independent IDE — Phase 7

Date: 2026-07-14

Status: implemented and verified

## Debug engine

Project Blue now speaks the Debug Adapter Protocol through a guarded desktop service. Python sessions use a project-local Debugpy 1.8.21 adapter. Node.js sessions use Project Blue's own DAP adapter over Node's Inspector protocol.

The workbench supports:

- launch profiles and process attachment
- source and conditional breakpoints
- continue, pause, step over, step into, and step out
- threads, call stacks, scopes, and variables
- watch expressions and Debug Console evaluation
- stdout/stderr streaming
- session start, stop, and termination events
- workspace-confined program and working-directory paths

Launch profiles are stored inside the selected project under `.blue/debug/launch.json`. No token or environment-secret storage was added.

## Workbench integration

Run and Debug now exposes runtime, launch/attach mode, program, working directory, arguments, profiles, breakpoints, watch expressions, call stack, variables, and Debug Console controls. Debug events are delivered through the existing guarded Electron bridge.

## Acceptance verification

Automated tests launch real temporary Python and Node.js programs. Both adapters were verified to:

1. install a conditional breakpoint;
2. stop at the expected source line;
3. return a call stack and scopes;
4. return variables;
5. evaluate the `name` watch expression as `Blue`;
6. continue execution.

The control-route audit also permanently checks the required UI controls, bridge methods, DAP commands, local Debugpy adapter, Node Inspector transport, and conditional-breakpoint capability.

