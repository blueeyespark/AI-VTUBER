"use strict";

class SafetyController {
  constructor({ privacyMode = "basic_geometry", permissionMode = "safe" } = {}) {
    this.privacyMode = privacyMode;
    this.permissionMode = permissionMode;
  }
  canUseAwareness(kind) {
    const rank = { none: 0, basic_geometry: 1, active_window_metadata: 2, approved_visual_awareness: 3 };
    const need = { monitor_bounds: 1, cursor_position: 1, active_window: 2, window_rectangles: 2, screen_pixels: 3 }[kind] ?? 3;
    return (rank[this.privacyMode] || 0) >= need;
  }
  approveAction(action) {
    const unsafe = ["click", "type", "go_live", "change_settings", "install_software", "grant_permission"];
    if (unsafe.includes(action)) return { allowed: false, reason: "requires separate explicit approval" };
    return { allowed: true, reason: "presentation-only companion action" };
  }
}

module.exports = { SafetyController };
