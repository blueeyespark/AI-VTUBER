# Blue Streaming and AI VTuber Research

Date: 2026-07-11

## Goal

Blue/Qwen should grow from a desktop companion into a streaming-capable AI VTuber control center:

- read stream chat;
- prepare OBS scenes and sources;
- switch approved OBS scenes;
- support VRM, Live2D, and optional stage-controller backends such as Warudo;
- support creator-defined SFW and mature-labeled stream rules;
- build better Blue/Qwen voice profiles without impersonating non-consenting people;
- eventually run independent stream preparation with creator approval gates.

## Official integration direction

### OBS / Streamlabs-style controls

Primary local control should use OBS websocket 5.x. Blue should start with:

- `GetVersion` to verify connection;
- `GetSceneList` to inspect scenes;
- `SetCurrentProgramScene` only after explicit approval;
- later: source visibility, text/source updates, replay buffer, and stream status.

Streamlabs-style behavior should map to the same safety model first: scene/source inspection, approved scene switching, and logged changes. Direct Streamlabs-specific APIs should be added only after confirming the current official docs and token flow.

Source: OBS websocket protocol docs.

### Stream chat

Twitch chat should use official Twitch developer APIs/EventSub chat events. YouTube Live chat should use YouTube Data API live chat message endpoints. Discord chat uses the existing Project Blue Discord add-on with guild/channel/user allowlists.

Tokens, stream keys, bot tokens, and OAuth secrets must stay out of files and screenshots.

Sources: Twitch EventSub/chat docs; YouTube `liveChatMessages` docs; Discord Developer docs.

### Platform and content rules

Blue can support:

- safe-for-work streams;
- mature-labeled streams when the platform and category allow them;
- creator-defined profanity rules.

Blue must not bypass platform rules. Blue should block slurs, harassment, threats, doxxing, illegal content, sexual content involving minors, and platform-banned terms/actions.

Going live, switching to mature mode, posting on socials, monetization/account changes, or escalation moderation must require explicit approval.

Source: Twitch Community Guidelines and platform-specific safety docs.

### Avatar backends

Blue should expose one unified avatar control layer:

- VRM 3D: default full-body model;
- Live2D: optional 2D rig backend;
- Warudo/stage tools: optional bridge, not a hard dependency;
- OBS capture: Blue remains visible as a capture source.

Sources: Live2D Cubism SDK docs; VRM/three-vrm docs.

### Voice

Blue currently uses OS/browser speech voices as fallback. The next voice system should add local voice profiles with:

- pitch/rate/style presets;
- named Blue and Qwen voice profiles;
- optional future owned/consented sample ingestion;
- consent and provenance records.

Blue must not clone or impersonate another person’s voice without permission.

## Built in this pass

- New Streaming Studio workspace in the Control Center.
- OBS websocket URL/password controls, with password session-only.
- Nonsecret streaming config saved locally.
- OBS connection check through `GetVersion`.
- OBS scene loading through `GetSceneList`.
- Approved scene switching through `SetCurrentProgramScene`.
- Platform mode controls: SFW, mature-labeled, platform-review.
- Chat readiness, rules, moderation, avatar backend, voice, and independent-mode planning actions.
- Control audit placement for all Streaming controls.
- Streaming core unit tests.

## Not built yet

- Actual Twitch OAuth/EventSub listener.
- Actual YouTube OAuth/live chat reader.
- Automatic OBS source editing beyond approved scene switching.
- Stream start/stop automation.
- Direct Streamlabs Desktop API integration.
- Local neural voice training/synthesis.
- Full Live2D runtime bridge inside the desktop pet.

These should be added as separate permission-gated milestones.
