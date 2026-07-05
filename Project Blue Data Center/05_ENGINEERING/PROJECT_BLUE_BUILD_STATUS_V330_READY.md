# Project Blue v3.3 Movement Upgrade Ready

Date: 2026-07-05

## Candidate

- Project Blue release: **3.3.0**
- Desktop pet: **2.3.0**
- Movement controller: velocity-based acceleration, curved turns, stopping-distance
  braking, and no-overshoot arrival
- Character motion: speed-driven cadence/stride, stance-foot compensation, toe
  push-off, torso counter-motion, turn lean, and secondary follow-through
- Navigation: readable mostly-horizontal routes with retained multi-display travel
- Existing gestures, voice, OBS, chat, sharing, OCR, Discord, approvals, audit,
  backup, and expansion features preserved

## Verification target

- 29 desktop tests
- 13 safe-expansion tests
- 88 core Python tests
- JavaScript syntax suite
- Live right/left movement captures
- Verified pre-install database backup
- SHA-256 match for permanent and canonical staging installs

## Research and handoff

- `BLUE_ANIMATION_MOVEMENT_RESEARCH_V330.md`
- `BLUE_ANIMATION_MOVEMENT_FUTURE_IMPROVEMENTS_V330.md`
