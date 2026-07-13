"use strict";

function defaultProfile(characterId = "blue") {
  return {
    characterId,
    modelScale: 1,
    groundOffset: 0,
    walkSpeed: 82,
    runSpeed: 180,
    turnSpeed: 8,
    strideLength: 0.72,
    clipMappings: { idle: "idle", walk: "walk", run: "run", wave: "wave", sit: "sit", sleep: "sleep" },
    expressionMappings: { neutral: "neutral", happy: "happy", curious: "curious", focused: "focused", concerned: "concerned" },
    ikLimits: { headYaw: 35, headPitch: 25, eyeYaw: 20, armReach: 0.65 },
    homePosition: { monitor: "primary", corner: "bottom_right" },
    safeWindowSize: { width: 260, height: 560 },
    disabledClips: []
  };
}

function normalizeProfile(value = {}) {
  return { ...defaultProfile(value.characterId || "blue"), ...value, clipMappings: { ...defaultProfile().clipMappings, ...(value.clipMappings || {}) }, expressionMappings: { ...defaultProfile().expressionMappings, ...(value.expressionMappings || {}) } };
}

module.exports = { defaultProfile, normalizeProfile };
