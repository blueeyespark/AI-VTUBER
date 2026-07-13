# Blue Control Center Button Placement Audit - 2026-07-11

## Result

The Control Center now verifies that important buttons are not only wired, but also placed in the correct workspace.

## Workspace sorting

- Chat keeps conversation, paste/drop, OCR, file attach, quick create, research, and chat voice controls.
- Create & Research keeps learning, laboratory, agent, and expansion planning controls.
- Body, Voice & Presence keeps avatar, motion, OBS, microphone, voice, local brain, and privacy controls.
- System & Safety keeps Windows security and safe-status checks.
- Tools & Actions keeps developer diagnostics, function audit, Blue Doctor, approvals, artifacts, phone bridge, autonomy rules, and bounded PC actions.
- Discord keeps bot setup and connection controls.
- BlueMesh keeps shared-identity LAN sync controls.

## Verification added

`control-audit.cjs` now reports `placement.misplacedControls` and fails the audit if a mapped control appears in the wrong workspace.
