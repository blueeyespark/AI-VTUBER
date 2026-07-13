# Blue Advanced Desktop Companion Engine - Foundation Pass

Implemented: 2026-07-13

## Built

- Modular `companion_engine/` layer inside the desktop pet app.
- `DesktopCompanionEngine` orchestration facade.
- `MovementController`, `NavigationSystem`, and `MultiMonitorController` for safe desktop-position planning.
- `AnimationStateMachine` with layered locomotion/posture/activity/face/attention state.
- `BehaviorPlanner` and `BehaviorScheduler` for context-aware companion decisions.
- `EmotionState` with bounded explainable values and expression mapping.
- `HabitMemory` for local low-risk preferences and recent action memory.
- `SafetyController` for privacy modes and unsafe OS-action gating.
- `ActionQueue` for prioritized companion actions.
- `ModelProfile` normalization for per-character movement/IK/profile defaults.
- `DebugInspector` snapshot for live companion state.

## Verified

- Desktop app test suite: 50/50 passed.
- New companion engine tests cover:
  - multi-monitor safe bounds
  - reserved-region destination planning
  - behavior decisions for speaking, blocking, and stream mode
  - bounded emotion/expression mapping
  - privacy/unsafe-action gates
  - model profile defaults
  - crash-safe restore to idle
- `npm run check` now includes the new companion engine modules.

## Still not complete

This pass creates the tested engine foundation. The live Electron pet still needs wiring so the transparent pet window physically follows engine output in production. Remaining work:

- connect `DesktopCompanionEngine` to `main.cjs` pet window movement loop
- expose inspector state in the Control Center
- add character profile JSON under `assets/characters/blue/`
- connect voice state to `VoiceAnimationSystem` behavior
- add animation library browser for VRMA/GLTF/Mixamo/BVH metadata
- add long-running autonomous/soak tests
- add real active-window metadata integration under privacy gates
