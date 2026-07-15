# Project Blue Streaming Studio preservation contract

The Streaming Studio is a permanent Project Blue capability area. UI rebuilds may reorganize it, but must not silently remove its ideas, routes, controls, safety gates, or tests.

## What is implemented

- AI show-runner planning with Neuro-style chat, gaming, creator/build, art/3D/Live2D, music/voice, and adult-verified formats.
- Guarded autonomy profiles for assistant, co-host, producer, and independent-guarded operation.
- OBS WebSocket connection checks, scene reads, and explicitly approved scene switching.
- SFW/community, adult-verified, and custom platform catalogs.
- Platform chat guidance, local moderation tests, preflight, and adult-platform readiness.
- VRM, Live2D, Warudo, and hybrid avatar-output configuration.
- Local title/category/tag/producer-note drafts.
- Session-only passwords/tokens and approval gates for live or account-changing actions.

## Honest capability boundaries

Catalog entries are not proof that a platform is connected. Twitch/YouTube/Discord have documented integration paths; many other sites still require a creator-approved adapter. Project Blue does not automatically store credentials, go live, publish metadata, message fans, change monetization, or perform adult actions.

## Update rule

Before merging an update, run the desktop test suite. `streaming-preservation.test.cjs` checks the source-controlled manifest, required platform/show catalogs, editor routes, UI controls, and renderer wiring. A missing streamer idea must fail the update test instead of disappearing unnoticed.

