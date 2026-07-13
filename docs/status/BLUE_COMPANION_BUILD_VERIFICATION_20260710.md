# Blue Companion Build Verification - 2026-07-10

State: built as a safe prototype layer and verified.

## Built in this pass

- Added `src/blue_companion/` as the organized companion platform package.
- Added capability registry for animation, control panel, creation, Discord, learning, messaging, OBS, research, scheduling, social, streaming, and vision.
- Added avatar movement planner:
  - one-file-at-a-time interaction guard
  - bend-to-taskbar file pickup
  - reach-up-to-display interaction
  - transparent neck drag handle
  - taskbar-as-floor anchor
  - movement state list for idle, walk, run, wave, smile, drag, land, edge balance, hair/tail follow-through
  - Blueeyespark repair queue for duplicate socks, clothing coverage, T-pose, hair stiffness, and tail motion
- Added AI-to-AI / creator messaging planner for Qwen or trusted BlueMesh targets.
- Added OBS scene/source/stream action planner with approval gates.
- Added streaming brain planner for Neuro-style VTuber loop.
- Added vision intake planner for user-provided images/videos plus hidden-capture guard.
- Added reference-aware art/3D/Live2D creation planner.
- Added teaching/research lesson planner.
- Added social post draft queue requiring creator approval.
- Added schedule/routine planner.
- Added workbench-style control panel section map.
- Added docs under `docs/companion/`.
- Updated README repository map and companion section.

## Verification

- `python -m unittest discover -s tests -p test_blue_companion.py` passed: 7 tests.
- `python -m blue_companion` passed and emitted 9 action plans.
- Full root Python test discovery passed: 13 tests.
- Minecraft Butchery root check showed only Minecraft folders/files remain; no new Blue source was written there.

## Safety status

- Prototype does not connect to Discord, OBS, Twitch, socials, cameras, or generation providers directly.
- Tokens are not stored or logged.
- External sends, social posts, livestream state, Discord bot actions, and OBS stream actions require creator approval.
- Hidden capture remains blocked unless a creator explicitly enables it and Blue shows visible status.

## Research sources recorded

- OBS obs-websocket 5.x protocol.
- Discord Developer Platform overview.
- Twitch EventSub `channel.chat.message` subscription.
- three-vrm VRM loader documentation.
- VRM official avatar portability notes.
- Live2D Cubism SDK model, motion, expression, physics, and lip-sync topics.

## Future implementation notes

This pass is a platform skeleton and planner layer. Next real build steps should wire these plans into the Electron control center and desktop pet runtime:

1. Add control-center UI pages for Companion, Stream, Create, Learn, Vision, Messages, and Motion.
2. Connect motion planner states to the existing desktop pet locomotion/renderer.
3. Add an approved local token vault instead of source-controlled tokens.
4. Add real Discord bot connector with explicit intents and bot-token setup instructions.
5. Add Twitch EventSub WebSocket connector with manual token setup and creator-visible status.
6. Add OBS websocket connector with request previews and rollback/status logging.
7. Add image/reference manifest storage to Blue's SQLite database.
8. Add BlueMesh relay messages for Qwen/roommate devices.
9. Add avatar asset repair work as versioned Blender/VRM candidate exports, never overwriting originals.
10. Add generated-art and social-post queues with final approval screens.
