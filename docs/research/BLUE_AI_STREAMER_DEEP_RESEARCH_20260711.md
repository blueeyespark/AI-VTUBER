# Blue AI Streamer Deep Research

Date: 2026-07-11

Goal: improve Project Blue's streamer system so Blue/Qwen can act less like a static desktop pet and more like a real AI streamer/showrunner: chat-aware, OBS-aware, avatar-aware, voice-aware, safe, and expandable across SFW and adult-platform workflows.

## What successful AI streamers are doing

### Neuro-style AI VTuber pattern

The useful pattern is not one single trick. It is a loop:

1. read chat in batches;
2. filter unsafe or platform-risky messages;
3. pick a response target;
4. answer in a consistent persona;
5. drive avatar face/gesture/voice from the answer;
6. remember useful recurring jokes, people, projects, or goals;
7. switch scenes/effects only when allowed;
8. keep the show moving with games, topics, music, art, or build tasks.

For Blue this means the streamer tab needs:

- show format presets;
- persona/memory callbacks;
- chat pacing and selection;
- moderation before voice output;
- avatar expression hooks;
- OBS scene/source readback;
- approval gates for live actions.

### Streamlabs-style AI producer pattern

Streamlabs-style streamer tooling is less about persona and more about production:

- scene/source awareness;
- overlays and alerts;
- microphone/camera/desktop capture checks;
- chat summaries;
- suggested responses;
- moderation and stream health;
- automation with clear approval boundaries.

For Blue this means the streamer tab should become a producer cockpit:

- OBS connection status;
- current scene/source list;
- one-click preflight;
- scene-change proposals;
- chat reader status;
- platform rule mode;
- voice/avatar backend status;
- go-live blockers.

Research note: current Streamlabs/Inworld/NVIDIA-style assistant coverage emphasizes real-time technical support, game-aware commentary, highlight/clip capture, polls, sound/visual effects, setup troubleshooting, selectable personalities, and optional hidden/cohost presentation. Blue should copy the useful workflow idea, not depend on their stack.

### Other AI-streamer lessons

Always-on AI streams can fail when:

- chat can prompt-inject the character directly;
- unsafe text goes straight to TTS;
- platform rules are not checked per target;
- copyright/music/video reuse is uncontrolled;
- there is no human approval layer for live account actions;
- the stream cannot pause when the model is uncertain.

Blue should therefore use a "showrunner buffer": chat is intake, not command authority. Blue chooses safe responses after filters, not raw chat mirroring.

### Live-stream assistant research direction

Recent live video assistant research points at two important upgrades for Blue:

- streaming context should be processed incrementally instead of as random screenshots;
- Blue should learn response timing and silence, so it comments when useful and stays quiet when speaking would interrupt the show.

This maps to future `vision_tick`, `stream_memory_window`, and `speak_or_wait` modules.

## New Project Blue show formats

Implemented in `streaming-core.cjs`:

- `neuro_chat`: AI VTuber chat show with banter, callbacks, avatar reactions, and safe closer.
- `game_companion`: game stream companion with goals, chat questions, highlight markers, and breaks.
- `creator_lab`: VS Code/Codex-style build stream with agenda, work sessions, explanations, chat review, and commit summary.
- `art_modeling`: art, 3D, VRM, and Live2D stream workflow with reference review and asset checks.
- `music_voice`: voice/music hangout with safe TTS, request queue, and consented voice profiles.
- `adult_verified`: adult-platform-only preparation with age/consent/platform review and approval checkpoints.

## New Project Blue autonomy levels

Implemented in `streaming-core.cjs`:

- `assistant`: reads chat, summarizes, drafts replies, prepares run-of-show.
- `cohost`: can use approved replies/reactions and mark highlights.
- `producer`: prepares OBS scenes, watches health, suggests moderation, queues clips.
- `independent_guarded`: runs approved low-risk segments, reads chat, uses approved reactions, and stands by when unsafe.

Important: every autonomy level still requires approval for going live, stopping a stream, changing account settings, monetized actions, adult-platform actions, and risky moderation.

## Blue/Qwen streamer architecture

```text
chat intake
  -> platform adapter
  -> safety/moderation filter
  -> topic selector
  -> persona + memory
  -> response draft
  -> policy check
  -> voice queue
  -> avatar expression/gesture queue
  -> OBS proposal queue
  -> ledger/audit
```

OBS and account actions stay separate:

```text
Blue may inspect -> Blue may propose -> creator approves -> Blue executes -> Blue logs
```

## Platform and API research notes

- OBS remote control is built around obs-websocket 5.x. Blue should read current scene/source state before making proposals.
- Twitch chat/event work should use EventSub and scoped, session-only creator-approved tokens.
- YouTube Live chat uses LiveChatMessages for active broadcast chat; OAuth tokens must not be written to Project Blue files.
- Discord uses the existing add-on pattern with guild/channel/user allowlists and session-only bot token handling.
- SFW and adult platforms must remain separated by platform type, stream mode, and approval gates.

## Improvements now implemented

- Added `streamShowCatalog()`.
- Added `streamingAutonomyCatalog()`.
- Added `buildStreamerShowPlan()`.
- Added `buildStreamerRunOfShow()`.
- Exposed show formats and autonomy levels through `blue:streaming-status`.
- Added `showrunner` support to `blue:streaming-plan`.
- Added tests proving:
  - show catalogs exist;
  - adult show formats are blocked on SFW targets;
  - independent mode warns unless using guarded autonomy;
  - run-of-show includes segments, approval boundaries, and memory guidance.

## Next streamer-tab UI work

Add these visible controls:

- Show Format: Chat Show, Game Companion, Creator Lab, Art/Modeling, Music/Voice, Adult Verified.
- Autonomy: Assistant, Co-host, Producer, Independent Guarded.
- Generate Run-of-Show.
- Check Go-Live Blockers.
- OBS Scene Proposal Queue.
- Chat Intake Buffer.
- Voice Queue.
- Avatar Reaction Queue.
- Highlight/Clip Queue.

## Research sources

- OBS remote control: https://obsproject.com/kb/remote-control-guide
- Twitch EventSub: https://dev.twitch.tv/docs/eventsub/
- Twitch Community Guidelines: https://safety.twitch.tv/s/article/Community-Guidelines?language=en_US
- YouTube Live chat API: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list
- YouTube live/policy help entrypoint: https://support.google.com/youtube/topic/9257891
- Discord Developer docs: https://discord.com/developers/docs/intro
- VTube Studio API entrypoint: https://github.com/DenchiSoft/VTubeStudio
- VRM specification entrypoint: https://vrm.dev/en/
- Live2D Cubism SDK docs entrypoint: https://docs.live2d.com/en/cubism-sdk-manual/top/
- Streamlabs/Inworld/NVIDIA assistant coverage: https://www.theverge.com/2025/1/6/24335356/virtual-ai-intelligent-streaming-assistant-inworld-streamlabs-nvidia
- Streamlabs Intelligent Gaming Agent coverage: https://www.techradar.com/gaming/after-seeing-logitechs-ai-powered-game-streaming-assistant-in-action-i-think-its-one-of-the-best-uses-of-the-tech-yet
- Live streaming assistant research direction: https://arxiv.org/abs/2511.05299
