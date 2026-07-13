# Blue Animation and Movement: Future Work

Date: 2026-07-05

This is the handoff list for improvements that need model authoring, more motion
assets, or a larger navigation system than the safe v3.3 runtime patch.

## Next model pass in Blender

- Repair and verify the humanoid rest pose, shoulder roll, elbows, knees, ankle
  pivots, toe pivots, and hand orientation.
- Repaint shoulder, chest, jacket, skirt, hip, and thigh weights through the full
  walk/run pose range; add corrective shape keys where clothing collapses.
- Review clothing coverage in every animation pose and keep the approved outfit
  as the visible default.
- Divide hair into intentional front, side, and back chains. Add conservative
  spring values and head/shoulder/body colliders, then test fast turns and stops.
- Verify tail weights, root placement, collider radius, and maximum bend.
- Author in-place clips: breathe idle, alert idle, walk, run, walk start, walk
  stop, run start, run stop, 90-degree turns, 180-degree turn, wave, smile,
  point, sit, crouch, celebrate, and recover-balance.
- Make every locomotion clip loop cleanly with matching first/last contact poses.
- Export a clean VRM plus separate VRMC_vrm_animation or glTF clips; preserve the
  editable `.blend` source and record hashes.

## Next runtime pass

- Add an `AnimationMixer` locomotion state machine with synchronized idle/walk/run
  crossfades and phase-preserving speed changes.
- Retarget authored clips through normalized VRM humanoid bones.
- Add two-bone leg IK with contact markers and foot locking. Release a planted
  foot only when the gait phase enters toe-off.
- Add start, stop, pivot, and turn-in-place states selected from speed, remaining
  distance, and heading error.
- Blend eight travel directions so vertical desktop routes do not reuse a purely
  side-on gait.
- Add short inertial transitions when an action is interrupted.
- Add hand targets for pointing at controls, files, notifications, and screen
  regions—with explicit user activation for screen-aware actions.

## Desktop navigation

- Represent each display as a bounded navigation region with safe portals between
  adjacent screens.
- Add optional avoidance zones for the taskbar, user-pinned areas, fullscreen
  apps, and sensitive windows.
- Use short readable paths with look-ahead instead of choosing only a final point.
- Add edge anticipation, peek, hop, sit, and climb animations where paths meet
  screen boundaries.
- Never steal focus, type, click, or move user windows without an approved action.

## Expressiveness

- Add a small animation grammar: notice, orient, anticipate, act, react, settle.
- Couple gaze, blink timing, ears, breath, posture, and facial expression to the
  current task without making constant distracting motion.
- Give voice lines matching gesture beats and pause locomotion for important
  speech.
- Add a reduced-motion setting and intensity sliders for roaming, secondary
  motion, idle gestures, and camera-follow.

## Verification required before each release

- Automated tests for acceleration, braking, no overshoot, turn direction,
  bounded coordinates, invalid timing, and reduced-motion mode.
- Visual captures at idle, walk start, full walk, run, braking, left/right turns,
  arrival, wave while walking, fast hair turn, and multi-monitor transfer.
- Check face orientation against travel direction; reject any backward walk.
- Check feet for sliding, knee inversion, toe penetration, and leg overextension.
- Check hair, tail, jacket, and skirt for explosions or body penetration.
- Confirm control panel, OBS capture, startup, chat, voice, files, OCR, Discord,
  approvals, backups, and restore verification still work.
- Keep a database backup and SHA-256 installation manifest for every release.

## Long-range options

- Motion matching or a motion graph once Blue has a licensed, character-specific
  animation library.
- Terrain-aware locomotion only if Blue later enters a 3D scene; desktop roaming
  should remain a lightweight 2D navigation problem.
- Physics-assisted secondary animation after the supplied hair and clothing rigs
  are repaired and stable.
