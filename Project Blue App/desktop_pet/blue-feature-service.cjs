const FEATURE_DEFINITIONS = Object.freeze({
  memory: { label: "Blue Memory", activity: "workspace", editor: "workspace.memory", mutating: false },
  bluemesh: { label: "BlueMesh", activity: "bluemesh", editor: "mesh.sync", mutating: false },
  discord: { label: "Discord", activity: "discord", editor: "discord.connection", mutating: false },
  streaming: { label: "Streaming Studio", activity: "streaming", editor: "streaming.studio", mutating: false },
  voice: { label: "Voice", activity: "presence", editor: "presence.voice", mutating: false },
  vision: { label: "Vision and Presence", activity: "presence", editor: "presence.privacy", mutating: false },
  companion: { label: "Desktop Companion", activity: "presence", editor: "presence.avatar", mutating: false },
  research: { label: "Research", activity: "workspace", editor: "workspace.research", mutating: false },
  ideas: { label: "Ideas", activity: "workspace", editor: "workspace.ideas", mutating: true },
  generated: { label: "Generated Content", activity: "workspace", editor: "workspace.generated", mutating: false },
  workflows: { label: "Creator Workflows", activity: "workspace", editor: "workspace.notes", mutating: true }
});

function cleanFeatureName(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

class BlueFeatureService {
  constructor(adapters = {}) { this.adapters = { ...adapters }; }
  attach(adapters = {}) { this.adapters = { ...this.adapters, ...adapters }; return this; }

  resolve(name) {
    const requested = cleanFeatureName(name);
    return Object.keys(FEATURE_DEFINITIONS).find(key => cleanFeatureName(key) === requested || cleanFeatureName(FEATURE_DEFINITIONS[key].label) === requested) || "";
  }

  async catalog() {
    const rows = [];
    for (const [id, definition] of Object.entries(FEATURE_DEFINITIONS)) {
      const adapter = this.adapters[id];
      let state = adapter ? "ready" : "unavailable";
      let summary = adapter ? "Connected to the Project Blue workbench." : "Backend adapter is not connected.";
      if (adapter?.status) {
        try {
          const value = await adapter.status();
          summary = adapter.summarize ? adapter.summarize(value) : "Status available.";
        } catch (error) {
          state = "attention";
          summary = String(error?.message || error || "Status check failed.");
        }
      }
      rows.push({ id, ...definition, state, summary, actions: Object.keys(adapter?.actions || {}) });
    }
    return { version: 1, identity: "one-blue", generatedAt: new Date().toISOString(), features: rows };
  }

  async execute(request = {}) {
    const feature = this.resolve(request.feature);
    if (!feature) throw new Error("Unknown Project Blue feature.");
    const adapter = this.adapters[feature];
    if (!adapter) throw new Error(`${FEATURE_DEFINITIONS[feature].label} is not connected.`);
    const action = String(request.action || "status").trim();
    if (action === "status") return { feature, action, data: await adapter.status() };
    const handler = adapter.actions?.[action];
    if (!handler) throw new Error(`${FEATURE_DEFINITIONS[feature].label} does not expose action '${action}'.`);
    const sensitive = adapter.sensitiveActions?.includes(action) || FEATURE_DEFINITIONS[feature].mutating;
    if (sensitive && request.approved !== true) throw new Error(`Action '${action}' requires explicit approval.`);
    return { feature, action, data: await handler(request.value) };
  }

  async handleMessage(message) {
    const text = String(message || "").trim();
    if (!/^\/blue(?:\s|$)/i.test(text)) return null;
    const parts = text.split(/\s+/);
    if (parts.length === 1 || parts[1]?.toLowerCase() === "features") return { type: "blueFeatures", data: await this.catalog() };
    const feature = parts[1];
    const action = parts[2] || "status";
    const approved = parts.at(-1) === "APPROVE";
    const valueParts = parts.slice(3, approved ? -1 : undefined);
    return { type: "blueFeature", data: await this.execute({ feature, action, value: valueParts.join(" "), approved }) };
  }
}

function formatBlueFeatureResult(result) {
  if (!result) return "";
  if (result.type === "blueFeatures") {
    return ["Project Blue workbench features:", ...result.data.features.map(item => `- ${item.label}: ${item.state} — ${item.summary} [${item.activity}/${item.editor}]`)].join("\n");
  }
  if (result.type === "blueFeature") return `${FEATURE_DEFINITIONS[result.data.feature]?.label || result.data.feature} ${result.data.action}:\n${JSON.stringify(result.data.data, null, 2)}`;
  return JSON.stringify(result, null, 2);
}

module.exports = { BlueFeatureService, FEATURE_DEFINITIONS, formatBlueFeatureResult };
