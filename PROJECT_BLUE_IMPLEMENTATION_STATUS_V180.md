# Project Blue v1.8 Installed Status

Installed: 2026-07-03  
State: **running and verified**

## Reference-driven movement

- Whole-body locomotion with hips/chest counter-rotation
- Coordinated legs, knees, and arm swing
- Alternating exploration and timed rest states
- Smooth anticipation and follow-through envelopes
- Random look, lean, and wave behaviors
- Screen-edge reaction animation
- Pointer-aware head movement
- Expression synchronization during social gestures
- Click interaction interrupts the current state with a wave
- Stable bounded root-level hair and tail follow-through

## Supplied references

Three local MP4 references were inspected frame-by-frame and preserved under:

`assets\movement_references`

The analysis and source hashes are recorded in:

`assets\movement_references\BLUE_MOVEMENT_REFERENCE_ANALYSIS.md`

## Verification

- Blue version: 1.8.0
- Desktop-pet version: 0.5.0
- 83 Python tests passed
- Desktop JavaScript checks passed
- Offline dependency audit: 0 vulnerabilities
- Visual smoke capture passed
- Database integrity and audit chain: healthy
- v1.8 backup checksum: valid
- v1.8 isolated restore drill: passed
- Required database tables: 39
