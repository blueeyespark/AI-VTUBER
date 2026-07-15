"use strict";

const { clamp } = require("./geometry.cjs");

function boundedClock(seed = 0) {
  const value = Number(seed);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

class ProceduralLifeController {
  constructor(seed = {}) {
    this.time = boundedClock(seed.time);
    this.lastBlinkAt = boundedClock(seed.lastBlinkAt);
    this.nextBlinkIn = Number.isFinite(seed.nextBlinkIn) ? clamp(seed.nextBlinkIn, 1.5, 9) : 3.8;
    this.microExpression = seed.microExpression || "soft_focus";
    this.attention = seed.attention || "workspace";
    this.lastEvent = seed.lastEvent || null;
  }

  chooseAttention(context = {}, decision = {}) {
    if (context.dragged) return "user_drag";
    if (context.cursorNearby || context.mouse) return "cursor";
    if (context.activeWindow && /obs/i.test(context.activeWindow)) return "obs";
    if (context.activeWindow && /blender/i.test(context.activeWindow)) return "vrm_project";
    if (context.diagnostics?.errors > 0 || context.buildFailed) return "diagnostics";
    if (context.gitChangedFiles > 0 || context.gitChanges > 0) return "git_changes";
    if (context.discordUnread > 0) return "discord";
    if (context.streamingStatus && context.streamingStatus !== "offline") return "streaming";
    if (decision.action === "sit_rest") return "reading";
    if (decision.action === "sleep") return "rest";
    return "workspace";
  }

  suggest(context = {}, decision = {}) {
    const suggestions = [];
    if (context.gitChangedFiles > 0 || context.gitChanges > 0) suggestions.push(`${context.gitChangedFiles || context.gitChanges} changed file(s). Want a summary?`);
    if (context.buildFailed || context.diagnostics?.errors > 0) suggestions.push("I found a failure. I can explain it or make a safe fix plan.");
    if (context.activeWindow && /obs/i.test(context.activeWindow)) suggestions.push("OBS detected. Reconnect streaming profile?");
    if (context.activeWindow && /blender/i.test(context.activeWindow)) suggestions.push("Blender/VRM work detected. Continue avatar repair?");
    if ((Number(context.idleSeconds) || 0) > 900) suggestions.push("You have been focused for a while. Want a summary or break reminder?");
    if (context.blueMeshConflicts > 0) suggestions.push("BlueMesh conflict available for review.");
    if (decision.action === "idle_scan") suggestions.push("Workspace is steady. I can inspect recent files or run diagnostics.");
    return suggestions.slice(0, 4);
  }

  tick(deltaSeconds = 1 / 60, context = {}, decision = {}) {
    const delta = clamp(Number(deltaSeconds) || 0, 0, 1);
    this.time += delta;
    this.nextBlinkIn -= delta;
    const blink = this.nextBlinkIn <= 0;
    if (blink) {
      this.lastBlinkAt = this.time;
      const energy = clamp(Number(context.emotion?.energy ?? 0.5), 0, 1);
      this.nextBlinkIn = clamp(5.8 - energy * 2.4 + ((this.time * 997) % 1.8), 1.7, 8.5);
    }
    this.attention = this.chooseAttention(context, decision);
    const breath = Math.sin(this.time * Math.PI * 0.72) * 0.5 + 0.5;
    const weightShift = Math.sin(this.time * Math.PI * 0.19) * 0.5 + 0.5;
    const eye = this.attention === "cursor" ? "toward_cursor" : this.attention === "diagnostics" ? "focused_down" : this.attention === "discord" ? "notification_glance" : "soft_scan";
    const head = this.attention === "obs" ? "screen_right" : this.attention === "vrm_project" ? "editor_focus" : this.attention === "git_changes" ? "reviewing_changes" : "workspace_scan";
    const expression = context.buildFailed ? "curious" : context.buildSucceeded ? "smile" : context.speaking ? "talking" : blink ? "blink" : "attentive";
    this.microExpression = expression;
    return {
      breathing: Number(breath.toFixed(3)),
      weightShift: Number(weightShift.toFixed(3)),
      blink,
      eye,
      head,
      expression,
      attention: this.attention,
      suggestions: this.suggest(context, decision)
    };
  }

  snapshot() {
    return {
      time: Number(this.time.toFixed(3)),
      lastBlinkAt: Number(this.lastBlinkAt.toFixed(3)),
      nextBlinkIn: Number(this.nextBlinkIn.toFixed(3)),
      microExpression: this.microExpression,
      attention: this.attention,
      lastEvent: this.lastEvent
    };
  }
}

module.exports = { ProceduralLifeController };