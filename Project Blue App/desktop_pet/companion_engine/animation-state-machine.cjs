"use strict";

class AnimationStateMachine {
  constructor() {
    this.state = {
      locomotion: "idle",
      posture: "stand",
      activity: "listen",
      face: "neutral",
      attention: "idle_scan",
      blend: 0,
      procedural: {
        breathing: 0.5,
        weightShift: 0.5,
        blink: false,
        eye: "soft_scan",
        head: "workspace_scan",
        expression: "attentive"
      }
    };
    this.lastTransition = null;
  }

  transition(patch = {}, reason = "planner") {
    const previous = { ...this.state, procedural: { ...this.state.procedural } };
    this.state = { ...this.state, ...patch, procedural: { ...this.state.procedural, ...(patch.procedural || {}) } };
    this.lastTransition = { previous, next: this.snapshot(false), reason, at: new Date().toISOString() };
    return this.snapshot();
  }

  setFromMotion({ speed = 0, dragged = false, speaking = false, listening = false, life = null } = {}) {
    if (dragged) return this.transition({ locomotion: "dragged", activity: "react", procedural: life || {} }, "drag");
    const locomotion = speed > 160 ? "run" : speed > 8 ? "walk" : "idle";
    const activity = speaking ? "talk" : (listening ? "listen" : this.state.activity);
    const blend = Math.max(0, Math.min(1, Number(speed) / 180));
    const patch = { locomotion, activity, blend };
    if (life) patch.procedural = life;
    if (life?.attention) patch.attention = life.attention;
    if (life?.expression) patch.face = life.expression === "smile" ? "happy" : life.expression === "curious" ? "curious" : this.state.face;
    return this.transition(patch, "motion+life");
  }

  snapshot(includeTransition = true) {
    const snapshot = { ...this.state, procedural: { ...this.state.procedural } };
    if (includeTransition) snapshot.lastTransition = this.lastTransition;
    return snapshot;
  }
}

module.exports = { AnimationStateMachine };