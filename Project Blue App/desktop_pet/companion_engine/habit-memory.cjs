"use strict";

class HabitMemory {
  constructor(seed = {}) {
    this.data = { preferredCorner: "bottom_right", preferredMonitor: "primary", quietApps: [], recentActions: [], failedMotions: [], ...seed };
  }
  recordAction(action) { this.data.recentActions.push({ action, at: new Date().toISOString() }); this.data.recentActions = this.data.recentActions.slice(-50); }
  recordFailedMotion(reason) { this.data.failedMotions.push({ reason, at: new Date().toISOString() }); this.data.failedMotions = this.data.failedMotions.slice(-30); }
  updatePreference(key, value) { if (["preferredCorner", "preferredMonitor", "voiceVolume", "moveDuringStreaming"].includes(key)) this.data[key] = value; return this.snapshot(); }
  reset() { this.data = { preferredCorner: "bottom_right", preferredMonitor: "primary", quietApps: [], recentActions: [], failedMotions: [] }; }
  snapshot() { return JSON.parse(JSON.stringify(this.data)); }
}

module.exports = { HabitMemory };
