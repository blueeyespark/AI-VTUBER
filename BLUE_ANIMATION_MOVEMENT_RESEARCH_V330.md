# Project Blue v3.3 Animation and Movement Research

Date: 2026-07-05

## Goal

Make Blue read as a living character moving through desktop space, not a model
playing a walk pose while its window slides. The implementation must remain
offline-capable, bounded, testable, and compatible with the supplied VRM.

## Findings applied now

1. **Motion needs easing and weight.** Starts should build speed, stops should
   anticipate the destination, and secondary parts should settle after the body.
   Blue now uses bounded acceleration, stopping-distance braking, and spring
   follow-through.
2. **Locomotion must be driven by real speed.** Cadence, stride, knee flex, arm
   swing, bounce, and run weight now scale from measured desktop velocity rather
   than a binary walking flag.
3. **Feet need a stance phase.** Blue now counter-rotates feet during support and
   adds a small toe push-off. This is a procedural approximation of foot contact
   locking and noticeably reduces skating without requiring a new rig.
4. **Turns involve the whole body.** Velocity changes are curved, body heading is
   damped, hips lead, chest counter-rotates, and hair/tail lag behind.
5. **Screen travel should have readable staging.** Most generated trips favor
   horizontal movement near the current height, while occasional larger trips
   retain whole-desktop and multi-monitor exploration.
6. **Actions should layer over locomotion.** Existing wave, smile, look, nod,
   cheer, lean, stretch, dance, speech, blink, and pointer-look behaviors remain
   additive instead of replacing locomotion state.

## Architecture decision

The supplied VRM does not currently contain a verified library of authored idle,
walk, run, start, stop, or turn clips. Blue therefore keeps a responsive
procedural gait for v3.3. When clean Blender clips or VRM Animation assets are
available, Three.js `AnimationMixer` and weighted `AnimationAction` crossfades
should become the base layer, with Blue's procedural look, speech, balance,
hair, and interaction behaviors added above it.

This mirrors the useful division seen across interactive animation research:
authored motion preserves character performance; procedural control adapts it to
unpredictable paths and user input.

## Sources

- Three.js Animation System:
  https://threejs.org/manual/en/animation-system.html
- Three.js AnimationAction (weights, fades, crossfades, synchronization, warp):
  https://threejs.org/docs/pages/AnimationAction.html
- Three.js AnimationMixer:
  https://threejs.org/docs/pages/AnimationMixer.html
- Pixiv three-vrm VRMHumanoid normalized-bone API:
  https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html
- VRM specification:
  https://github.com/vrm-c/vrm-specification
- Khronos glTF animation and transform composition:
  https://github.khronos.org/Vulkan-Site/tutorial/latest/Building_a_Simple_Engine/Advanced_Topics/GLTF_Animation.html
- Khronos Blender/glTF conversion workflow:
  https://github.khronos.org/glTF-Tutorials/BlenderGltfConverter/
- Kovar, Gleicher, and Pighin, *Motion Graphs* (SIGGRAPH 2002):
  https://graphics.cs.wisc.edu/Papers/2002/KGP02/
- Pixar, *Character Articulation through Profile Curves*:
  https://graphics.pixar.com/library/ProfileMover/paper.pdf
- Pixar, *Harmonic Coordinates for Character Articulation*:
  https://graphics.pixar.com/library/HarmonicCoordinatesB/

## Boundaries

- Movie animation principles inform timing, weight, silhouette, anticipation,
  follow-through, and appeal; movie footage or proprietary animation is not
  copied.
- Blue does not download or execute third-party motion assets automatically.
- No collision-aware foot IK is claimed in v3.3; the current contact treatment is
  a deterministic procedural approximation.
