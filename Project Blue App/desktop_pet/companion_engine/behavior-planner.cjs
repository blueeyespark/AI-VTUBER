"use strict";

class ActionQueue {
  constructor() { this.items = []; }
  enqueue(action) { this.items.push({ id: action.id || `action_${Date.now()}_${this.items.length}`, priority: Number(action.priority) || 0, ...action }); this.items.sort((a, b) => b.priority - a.priority); return this.items[0]; }
  next() { return this.items.shift() || null; }
  clear() { this.items = []; }
  snapshot() { return this.items.map(item => ({ ...item })); }
}

class BehaviorPlanner {
  choose(context = {}) {
    const emotion = context.emotion || {};
    const idleSeconds = Number(context.idleSeconds) || 0;
    if (context.streamMode) return { action: "stream_pose", locomotion: "stay", reason: "stream mode keeps Blue in approved performance area" };
    if (context.speaking) return { action: "talk_gesture", locomotion: "stay", reason: "voice-synced performance" };
    if (context.dragged) return { action: "drag_recover", locomotion: "dragged", reason: "user dragging Blue" };
    if (context.blockingActiveWindow) return { action: "move_aside", locomotion: "walk", reason: "avoid blocking work" };
    if (idleSeconds > 1800 || emotion.fatigue > 0.75) return { action: "sleep", locomotion: "stay", reason: "long inactivity or fatigue" };
    if (idleSeconds > 300) return { action: "sit_rest", locomotion: "walk", reason: "idle rest behavior" };
    if (context.cursorNearby) return { action: "watch_cursor", locomotion: "stay", reason: "cursor attention" };
    return { action: "idle_scan", locomotion: "stay", reason: "balanced idle" };
  }
}

class BehaviorScheduler {
  constructor(planner = new BehaviorPlanner()) { this.planner = planner; this.lastAction = null; }
  tick(context) { const decision = this.planner.choose(context); this.lastAction = { ...decision, at: new Date().toISOString() }; return this.lastAction; }
}

module.exports = { ActionQueue, BehaviorPlanner, BehaviorScheduler };
