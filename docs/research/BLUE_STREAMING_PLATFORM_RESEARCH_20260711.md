# Blue Streaming Platform Research

Date: 2026-07-11

Purpose: expand Project Blue's Streaming Studio so Blue/Qwen can plan SFW streams, mature-labeled streams, and adult-platform streams without mixing platform rules, credentials, or safety gates.

## Platform groups

### SFW / mainstream

These targets are treated as normal public streaming surfaces. Blue can prepare OBS scenes, read chat when an official API or approved bridge exists, draft replies, and run moderation checks. Explicit adult streaming is blocked on this group.

- Twitch
- YouTube Live
- Kick
- TikTok LIVE
- Instagram Live
- Facebook Live
- X / Twitter Live
- Rumble
- Trovo
- Steam Broadcast
- Picarto
- Discord Stage / Discord chat
- Custom RTMP / other SFW target

### Adult / NSFW verified

These targets are treated as verified adult-platform targets. Blue can prepare scenes, checklists, moderation notes, overlays, and platform-specific plans only after creator approval. Blue does not store adult-platform credentials, stream keys, cookies, tokens, or private messages.

- Joystick
- Fansly
- OnlyFans
- Chaturbate
- Stripchat
- CamSoda
- ManyVids
- MyFreeCams
- BongaCams
- LiveJasmin
- LoyalFans
- Custom adult platform

## Required gates

Adult-platform preparation requires all of these before Blue considers it ready:

- all performers/participants are verified adults and consenting;
- target platform rules, category, age gate, and account requirements are reviewed for the session;
- creator explicitly approves adult-platform preparation;
- credentials and stream keys remain session-only and are not written to Project Blue files;
- going live, messaging, monetized actions, social posting, moderation escalation, and explicit scene changes require creator approval.

## Adapter plan

Blue now stores a platform registry in `Project Blue App/desktop_pet/streaming-core.cjs`.

- Official API paths are preferred when available.
- OBS/RTMP is used for video output where appropriate.
- Chat intake uses official APIs first, then creator-approved local bridges.
- Sites without stable official API access remain `approved_bridge` or `adapter_required`.
- `custom_rtmp` and `custom_adult` keep the system expandable without hardcoding unsafe assumptions.

## Research sources used

- OBS remote control / obs-websocket planning: https://obsproject.com/kb/remote-control-guide
- Twitch Community Guidelines and live safety rules: https://safety.twitch.tv/s/article/Community-Guidelines?language=en_US
- Twitch EventSub chat/event architecture: https://dev.twitch.tv/docs/eventsub/
- YouTube Live chat API planning: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list
- YouTube live/policy review entrypoint: https://support.google.com/youtube/topic/9257891
- Discord Developer platform entrypoint: https://discord.com/developers/docs/intro
- Chaturbate terms entrypoint for adult-platform review: https://chaturbate.com/terms/

## Current status

Implemented in the local app:

- expanded platform catalog;
- SFW/adult/custom platform categories;
- adult-platform readiness checks;
- SFW block against `adult_verified` mode;
- platform-specific chat guidance;
- no-token persistence rule;
- Control Center dropdown grouped by platform category;
- tests for the registry and adult/SFW separation.

Future work:

- add per-platform rule-refresh dates in the database;
- add first-class adapter modules for each supported platform;
- add stream profile templates for SFW, mature-labeled, and adult verified sessions;
- add separate OBS scene collections for SFW and adult workflows so Blue does not cross-load the wrong overlay or avatar state.
