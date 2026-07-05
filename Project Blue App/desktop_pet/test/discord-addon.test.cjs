"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  discordCommands,
  interactionAllowed,
  normalizeDiscordConfig,
  safeDiscordText
} = require("../discord-addon.cjs");

test("Discord config keeps only valid nonsecret IDs", () => {
  const config = normalizeDiscordConfig({
    applicationId: "123456789012345678",
    guildId: "223456789012345678",
    channelId: "323456789012345678",
    allowedUserIds: ["423456789012345678", "bad", "423456789012345678"],
    token: "must-not-survive",
    enabled: true
  });
  assert.equal(config.enabled, false);
  assert.equal(config.applicationId, "123456789012345678");
  assert.deepEqual(config.allowedUserIds, ["423456789012345678"]);
  assert.equal("token" in config, false);
});

test("Discord command uses status and bounded ask subcommands", () => {
  const command = discordCommands()[0];
  assert.equal(command.name, "blue");
  assert.deepEqual(command.options.map(value => value.name), ["status", "ask"]);
  assert.equal(command.options[1].options[0].max_length, 1500);
});

test("Discord interaction requires configured guild, channel, and optional user", () => {
  const config = normalizeDiscordConfig({
    applicationId: "123456789012345678",
    guildId: "223456789012345678",
    channelId: "323456789012345678",
    allowedUserIds: ["423456789012345678"]
  });
  const interaction = {
    guild_id: config.guildId,
    channel_id: config.channelId,
    member: { user: { id: config.allowedUserIds[0] } }
  };
  assert.equal(interactionAllowed(config, interaction), true);
  assert.equal(
    interactionAllowed(config, { ...interaction, channel_id: "999999999999999999" }),
    false
  );
});

test("Discord output suppresses mentions and stays below message limits", () => {
  const text = safeDiscordText(`@everyone ${"x".repeat(3000)}`);
  assert.equal(text.includes("@everyone"), false);
  assert.ok(text.length <= 1900);
});
