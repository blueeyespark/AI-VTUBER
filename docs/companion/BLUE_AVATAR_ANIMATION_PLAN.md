# Blue Avatar Animation Plan

## Immediate movement goals

- Stop stuck/T-pose behavior by using a small state machine: idle, look, walk, run, wave, smile, bend, reach, drag, land, edge-balance.
- Treat the Windows taskbar as Blue's floor so feet have a stable base.
- Interact with one file at a time. If a second file is requested, Blue finishes or cancels the current interaction first.
- For taskbar/floor objects, Blue bends down. For higher display objects, Blue reaches upward.
- Add a transparent drag handle near the neck/collar area that appears on hover and does not cover the face.
- During drag, Blue switches into carried/leaning motion, then lands back on the taskbar floor.

## Blueeyespark model repair queue

- Remove the duplicate/secondary sock mesh; keep the main socks.
- Verify clothing coverage so nipples are not exposed.
- Replace first-render T-pose with relaxed idle.
- Add hair damping/spring-bone settings to reduce stiffness and wild spikes.
- Add tail follow-through and settle animation.
- Keep all mesh edits reversible: never overwrite original VRM/Blender files without a versioned backup.

## Research notes

VRM gives Blue a portable humanoid avatar layer. three-vrm is the browser/Electron-friendly loader path. Live2D Cubism's expression, physics, breath, lip-sync, pose, and motion concepts are useful even when the active avatar is VRM, because they describe the motion layers Blue needs.
