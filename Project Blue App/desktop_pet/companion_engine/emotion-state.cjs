"use strict";

const { clamp, finiteNumber } = require("./geometry.cjs");

class EmotionState {
  constructor(seed = {}) {
    this.values = {
      valence: 0,
      energy: 0.45,
      focus: 0.5,
      socialInterest: 0.45,
      confidence: 0.5,
      fatigue: 0.15
    };
    this.update(seed);
  }

  update(delta = {}) {
    for (const key of Object.keys(this.values)) {
      if (Object.hasOwn(delta, key)) this.values[key] = clamp(finiteNumber(delta[key], this.values[key]), -1, 1);
    }
    this.values.energy = clamp(this.values.energy, 0, 1);
    this.values.focus = clamp(this.values.focus, 0, 1);
    this.values.socialInterest = clamp(this.values.socialInterest, 0, 1);
    this.values.confidence = clamp(this.values.confidence, 0, 1);
    this.values.fatigue = clamp(this.values.fatigue, 0, 1);
    return this.snapshot();
  }

  expression() {
    const v = this.values;
    if (v.fatigue > 0.75) return "sleepy";
    if (v.valence > 0.45 && v.energy > 0.55) return "happy";
    if (v.focus > 0.7) return "focused";
    if (v.confidence < 0.25) return "concerned";
    if (v.socialInterest > 0.65) return "curious";
    return "neutral";
  }

  snapshot() {
    return { ...this.values, expression: this.expression() };
  }
}

module.exports = { EmotionState };
