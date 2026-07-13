# Blue Streaming and Social Plan

## Streaming loop

Blue's live-show loop should be:

1. Perception: approved stream chat, Discord chat, OBS state, microphone transcript, visible screen/app context, and user-provided images/files.
2. Reasoning: goals for the stream, Blue's persona, memory, safety rules, topic queue, and creator instructions.
3. Performance: spoken line, expression, gesture, movement state, OBS cue, and optional chat reply.
4. Governance: approval gates for risky actions, moderation, posting, purchases, PC control, and stream start/stop.
5. Memory: after-stream summary into BlueMesh and BlueLedger.

## OBS

The prototype builds obs-websocket-style plans for scene changes, source creation, and stream start/stop. Live execution must verify authentication and must not log websocket passwords.

## Discord and stream chat

Discord bot control and Twitch/EventSub chat response loops are prototype plans. They require creator-provided tokens outside source control and approval rules for response mode:

- `manual` - Blue drafts, creator sends.
- `mention` - Blue can respond to direct mentions after approval rules are configured.
- `all` - highest-risk mode; creator-only enable.

## Social posting

Blue may draft posts and captions, but publishing must stay creator-approved. The queue should check privacy, credits, spoilers, platform fit, and media attachments before posting.
