"use strict";

class AnimationStateMachine {
  constructor() {
    this.state = { locomotion: "idle", posture: "stand", activity: "listen", face: "neutral", attention: "idle_scan" };
    this.lastTransition = null;
  }

  transition(patch = {}, reason = "planner") {
    const previous = { ...this.state };
    this.state = { ...this.state, ...patch };
    this.lastTransition = { previous, next: { ...this.state }, reason, at: new Date().toISOString() };
    return this.snapshot();
  }

  setFromMotion({ speed = 0, dragged = false, speaking = false, listening = false } = {}) {
    if (dragged) return this.transition({ locomotion: "dragged", activity: "react" }, "drag");
    const locomotion = speed > 160 ? "run" : speed > 8 ? "walk" : "idle";
    const activity = speaking ? "talk" : (listening ? "listen" : this.state.activity);
    return this.transition({ locomotion, activity }, "motion");
  }

  snapshot() {
    return { ...this.state, lastTransition: this.lastTransition };
  }
}

module.exports = { AnimationStateMachine };
