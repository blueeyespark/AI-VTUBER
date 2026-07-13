# Project Blue Control Center rebuild inventory

Date: 2026-07-11

Purpose: retire the crowded Control Center layout and rebuild the UI shell without dropping functions.

## Design references used

- VS Code-style workbench: activity rail, side bar, editor area, command/search entry, bottom status bar.
- Windows/Fluent control guidance: clear navigation destinations, command groups, primary/secondary action hierarchy.
- OBS-style streaming controls: separate setup, sources/scenes, chat/rules, and live checklist so streaming actions do not mix with general settings.

## Workspaces to preserve

1. Overview
   - health snapshot
   - function coverage
   - workspace map
   - diagnostics entry point

2. Chat
   - conversations
   - send message
   - paste text/link/notes
   - file/image/folder attach
   - clipboard paste
   - OCR image scan
   - save idea
   - learning request
   - deep research topic
   - agent plan
   - voice/listen shortcuts

3. Create & Research
   - idea laboratory
   - capability map
   - research sources
   - learning queue
   - agent mode
   - expansion planning

4. Body, Voice & Presence
   - presence/privacy mode
   - observation history
   - activity timeline
   - microphone and wake listening
   - voice settings/test
   - local AI brain/provider setup
   - avatar model selection
   - motion/expression controls
   - desktop/OBS presence helpers

5. System & Safety
   - Windows security snapshot
   - safe PC rules
   - autonomy rules
   - phone approval bridge
   - project/system info

6. Tools & Actions
   - function audit
   - Blue doctor
   - PC/display info
   - open Blue folder
   - diagnostics focus
   - artifact preview/open/reveal
   - approval/audit review

7. Streaming Studio
   - OBS connection and scene list
   - approved scene switching
   - OBS capture guide
   - platform mode and stream rules
   - chat readiness/moderation planning
   - VRM/Live2D/Warudo toggles
   - voice safety/test
   - independent stream checklist

8. Discord
   - non-secret IDs
   - session-only token entry
   - test token
   - register commands
   - connect/disconnect

9. BlueMesh
   - one shared Blue identity
   - node ID and creator ID
   - pairing token
   - LAN smoke test
   - copy receiver/push commands
   - trusted node/conflict state

## Backend bridges to preserve

The renderer currently depends on these backend categories:

- chat/share: chat, conversations, create/select/delete conversation, share files/images/folders/paths/link, paste content, OCR, clipboard
- memory/research/create: capture idea, capabilities, research catalog, learning records/capture/research, agent status/start/minimax, expansion status/list/create
- companion: presence status, proactivity, observation/activity history, health, voice settings, microphones, listen/wake listen, local provider/model setup
- avatar: current/select VRM model, show/hide control, show pet, wander, renderer pet commands
- safety/system: security snapshot, system info, PC action guidelines/run, autonomy, phone approval bridge, pending approvals, audit events
- artifacts: current/open/reveal artifact, base/outfit reference management
- BlueMesh: status, pairing token, LAN smoke test, docs
- Discord: config/status/save/test/register/connect/disconnect
- streaming: status, OBS config/check/scenes/switch, streaming plan

## Rebuild rule

No function should be removed. If a function is not mature enough for automatic execution, it must still have a visible planned/approval-gated home in the UI.
