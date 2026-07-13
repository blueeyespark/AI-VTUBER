# Blue Companion Platform

Project Blue is being organized as more than a desktop pet. Blue is a local AI companion platform with one shared identity through BlueMesh, a desktop avatar, persistent memory, creator approvals, streaming tools, teaching tools, creation tools, and safe integration points for Discord, Twitch, OBS, and social accounts.

## Current prototype

Code lives under `src/blue_companion/` and is sorted by capability:

- `animation/` - avatar movement, one-file interaction, taskbar-as-floor, transparent neck drag, repair queue.
- `art/` - reference-aware image/model generation planning and 3D/Live2D pipeline tasks.
- `control_panel/` - workbench-style sections for Blue's control center.
- `learning/` - research-and-teach plans for drawing, coding, streaming, and other lessons.
- `messaging/` - approval-gated Blue/Qwen/AI-user messages through BlueMesh.
- `obs/` - obs-websocket-style scene/source/stream command plans.
- `research/` - source-backed upgrade research plans.
- `scheduling/` - routines, stream prep, learning schedules, and reminders.
- `social/` - draft-only social posting queue requiring creator approval.
- `streaming/` - Neuro-style stream loop architecture using chat, OBS, expression, voice, and memory.
- `vision/` - user-provided image/video intake, OCR/description plans, and hidden-capture guard.

This first pass creates safe action plans. It does not post publicly, start streams, control Discord, spend money, or overwrite shared memory without approval.

## Identity rule

Blue may have many devices and creators, but only one shared Blue identity. BlueMesh owns shared identity, memory, settings, ledger, conflicts, and trusted nodes. The local desktop app owns PC-specific actions.

## External integration research used

- OBS: obs-websocket 5.x uses Hello, Identify, event, request, request-response, and request-batch messages over WebSocket/MessagePack/JSON.
- Discord: the Developer Platform supports bots, companion apps, commands, interactions, gateway events, webhooks, and OAuth2 with platform permissions.
- Twitch: EventSub includes `channel.chat.message` and WebSocket session events for stream chat ingestion.
- VRM/three-vrm: VRM is a glTF-based humanoid avatar format and three-vrm loads VRM through Three.js/GLTFLoader.
- Live2D: Cubism SDK supports model display, parameter control, hit/collision, eye blink, breath, lip sync, physics, pose, motion, and expressions.

## Safety rules

- Tokens are never stored in docs, tests, or action previews.
- `.env`, credential, token, secret, key, and certificate files must never sync through BlueMesh.
- Public posting, livestream start/stop, Discord moderation, and PC control require creator approval.
- Hidden screen/camera capture is blocked unless the creator explicitly enables it and Blue shows visible status.
- Shared memory and Constitution-style data must not be overwritten blindly.
