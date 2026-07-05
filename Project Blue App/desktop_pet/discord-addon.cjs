"use strict";

const API = "https://discord.com/api/v10";
const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
const SNOWFLAKE = /^\d{15,22}$/;

function normalizeDiscordConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const cleanId = input => {
    const result = String(input || "").trim();
    return SNOWFLAKE.test(result) ? result : "";
  };
  const allowedUserIds = Array.isArray(source.allowedUserIds)
    ? [...new Set(source.allowedUserIds.map(cleanId).filter(Boolean))].slice(0, 100)
    : [];
  return {
    version: 1,
    applicationId: cleanId(source.applicationId),
    guildId: cleanId(source.guildId),
    channelId: cleanId(source.channelId),
    allowedUserIds,
    enabled: false
  };
}

function discordCommands() {
  return [{
    name: "blue",
    description: "Talk to Project Blue",
    type: 1,
    options: [
      {
        type: 1,
        name: "status",
        description: "Show Blue's local status"
      },
      {
        type: 1,
        name: "ask",
        description: "Ask Blue a question",
        options: [{
          type: 3,
          name: "prompt",
          description: "What should Blue help with?",
          required: true,
          min_length: 1,
          max_length: 1500
        }]
      }
    ]
  }];
}

function interactionAllowed(config, interaction) {
  if (!config.guildId || interaction.guild_id !== config.guildId) return false;
  if (!config.channelId || interaction.channel_id !== config.channelId) return false;
  const userId = interaction.member?.user?.id || interaction.user?.id || "";
  return config.allowedUserIds.length === 0 || config.allowedUserIds.includes(userId);
}

function safeDiscordText(value, limit = 1900) {
  const text = String(value || "").replace(/@/g, "@\u200b").trim();
  if (!text) return "Blue completed the request without a text response.";
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

class DiscordAddon {
  constructor({ askBlue, blueStatus, onStatus }) {
    this.askBlue = askBlue;
    this.blueStatus = blueStatus;
    this.onStatus = onStatus;
    this.config = normalizeDiscordConfig();
    this.token = "";
    this.socket = null;
    this.heartbeat = null;
    this.state = "disconnected";
    this.botUser = null;
  }

  configure(value) {
    this.config = normalizeDiscordConfig(value);
    return this.status();
  }

  status() {
    return {
      state: this.state,
      configured: Boolean(
        this.config.applicationId && this.config.guildId && this.config.channelId
      ),
      tokenInMemory: Boolean(this.token),
      applicationId: this.config.applicationId,
      guildId: this.config.guildId,
      channelId: this.config.channelId,
      allowedUserIds: [...this.config.allowedUserIds],
      botUser: this.botUser
    };
  }

  emit(state, details = {}) {
    this.state = state;
    this.onStatus?.({ ...this.status(), ...details });
  }

  setToken(value) {
    const token = String(value || "").trim();
    if (token.length < 40 || token.length > 200) {
      throw new Error("Enter a valid Discord bot token for this session.");
    }
    this.token = token;
  }

  requireReadyConfig() {
    if (!this.config.applicationId || !this.config.guildId || !this.config.channelId) {
      throw new Error("Application, guild, and channel IDs are required.");
    }
    if (!this.token) throw new Error("Enter the bot token for this session.");
  }

  async request(route, options = {}, authenticated = true, retry = true) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (authenticated) headers.Authorization = `Bot ${this.token}`;
    const response = await fetch(`${API}${route}`, { ...options, headers });
    if (response.status === 429 && retry) {
      const rate = await response.json();
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(Number(rate.retry_after || 1) * 1000, 10000))
      );
      return this.request(route, options, authenticated, false);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Discord API ${response.status}: ${detail || response.statusText}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async testToken(token) {
    this.setToken(token);
    const user = await this.request("/users/@me");
    this.botUser = { id: user.id, username: user.username };
    this.emit("token-valid");
    return this.status();
  }

  async registerCommands(token) {
    this.setToken(token);
    this.requireReadyConfig();
    const route = `/applications/${this.config.applicationId}/guilds/${this.config.guildId}/commands`;
    const result = await this.request(route, {
      method: "PUT",
      body: JSON.stringify(discordCommands())
    });
    this.emit("commands-registered", { commandCount: result.length });
    return this.status();
  }

  async connect(token) {
    this.setToken(token);
    this.requireReadyConfig();
    if (this.socket) throw new Error("Discord is already connected or connecting.");
    this.emit("connecting");
    const socket = new WebSocket(GATEWAY);
    this.socket = socket;
    socket.addEventListener("message", event => this.onGatewayMessage(event.data));
    socket.addEventListener("error", () => this.emit("error"));
    socket.addEventListener("close", event => {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.socket = null;
      this.emit("disconnected", { closeCode: event.code });
    });
    return this.status();
  }

  disconnect() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.socket?.close(1000, "Blue disconnected");
    this.socket = null;
    this.token = "";
    this.botUser = null;
    this.emit("disconnected");
    return this.status();
  }

  sendGateway(payload) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  async onGatewayMessage(raw) {
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return; }
    if (payload.op === 10) {
      const interval = Math.max(5000, Number(payload.d?.heartbeat_interval || 45000));
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(
        () => this.sendGateway({ op: 1, d: null }),
        interval
      );
      this.sendGateway({
        op: 2,
        d: {
          token: this.token,
          intents: 1,
          properties: {
            os: process.platform,
            browser: "project-blue",
            device: "project-blue"
          }
        }
      });
    } else if (payload.op === 0 && payload.t === "READY") {
      this.botUser = payload.d?.user
        ? { id: payload.d.user.id, username: payload.d.user.username }
        : null;
      this.emit("connected");
    } else if (payload.op === 0 && payload.t === "INTERACTION_CREATE") {
      await this.handleInteraction(payload.d);
    } else if (payload.op === 7 || payload.op === 9) {
      this.disconnect();
    }
  }

  async interactionResponse(interaction, data) {
    return this.request(
      `/interactions/${interaction.id}/${interaction.token}/callback`,
      { method: "POST", body: JSON.stringify(data) },
      false
    );
  }

  async handleInteraction(interaction) {
    if (interaction?.type !== 2 || interaction.data?.name !== "blue") return;
    if (!interactionAllowed(this.config, interaction)) {
      await this.interactionResponse(interaction, {
        type: 4,
        data: {
          content: "Blue is not enabled for this channel or user.",
          flags: 64,
          allowed_mentions: { parse: [] }
        }
      });
      return;
    }
    const subcommand = interaction.data.options?.[0];
    if (subcommand?.name === "status") {
      await this.interactionResponse(interaction, {
        type: 4,
        data: {
          content: safeDiscordText(await this.blueStatus()),
          flags: 64,
          allowed_mentions: { parse: [] }
        }
      });
      return;
    }
    if (subcommand?.name !== "ask") return;
    const prompt = String(
      subcommand.options?.find(option => option.name === "prompt")?.value || ""
    ).trim().slice(0, 1500);
    await this.interactionResponse(interaction, {
      type: 5,
      data: { flags: 64 }
    });
    try {
      const response = await this.askBlue(prompt);
      await this.request(
        `/webhooks/${this.config.applicationId}/${interaction.token}/messages/@original`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: safeDiscordText(response),
            allowed_mentions: { parse: [] }
          })
        },
        false
      );
    } catch (error) {
      await this.request(
        `/webhooks/${this.config.applicationId}/${interaction.token}/messages/@original`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: safeDiscordText(`Blue could not answer: ${error.message}`),
            allowed_mentions: { parse: [] }
          })
        },
        false
      );
    }
  }
}

module.exports = {
  DiscordAddon,
  discordCommands,
  interactionAllowed,
  normalizeDiscordConfig,
  safeDiscordText
};
