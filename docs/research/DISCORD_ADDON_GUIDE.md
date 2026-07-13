# Project Blue Discord Add-on

Blue v2.9 adds optional, guild-scoped Discord application commands without
reading ordinary server messages.

## Commands

- `/blue status` reports Blue's local desktop state.
- `/blue ask prompt:<text>` sends one bounded prompt to Blue's persistent
  `Blue Discord` conversation.

Responses are ephemeral, user and role mentions are suppressed, and prompts
are limited to 1,500 characters.

## Setup

1. Create an application and bot in the Discord Developer Portal.
2. Install it in one server with the `bot` and `applications.commands` scopes.
3. In Discord, enable Developer Mode and copy the application, server, channel,
   and optional allowed-user IDs.
4. Open Blue's control center, select **Discord**, and save those nonsecret IDs.
5. Paste the bot token into the session-only field, choose **Test Token**, then
   **Register Commands**, then **Connect**.
6. Choose **Disconnect** before leaving the PC unattended.

The token is kept only in process memory. It is not written to Blue's config,
database, logs, or source files. Never send the token through chat or include
it in a screenshot.

## Safety boundaries

- The add-on is disabled and disconnected on startup.
- Only the configured guild and channel are accepted.
- An optional user-ID allowlist further limits access.
- Blue requests only the `GUILDS` Gateway intent.
- It does not request the privileged Message Content intent.
- Discord cannot bypass Blue's normal policy or approval checks.
- A single bounded retry honors Discord rate-limit responses.

Official references:

- https://docs.discord.com/developers/platform/interactions
- https://docs.discord.com/developers/events/gateway
- https://docs.discord.com/developers/topics/rate-limits
