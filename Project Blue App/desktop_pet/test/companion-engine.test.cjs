"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DesktopCompanionEngine } = require("../companion_engine/desktop-companion-engine.cjs");
const { EmotionState } = require("../companion_engine/emotion-state.cjs");
const { SafetyController } = require("../companion_engine/safety-controller.cjs");
const { normalizeProfile } = require("../companion_engine/model-profile.cjs");

test("advanced companion engine clamps movement to multi-monitor work areas", () => {
  const engine = new DesktopCompanionEngine({
    monitors: [
      { id: "left", workArea: { x: -1280, y: 0, width: 1280, height: 680 } },
      { id: "primary", workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
    ],
    position: { x: 3000, y: 2000 }
  });
  assert.ok(engine.movement.position.x <= 1920 - engine.profile.safeWindowSize.width);
  const plan = engine.planDestination({ x: -1200, y: 700 }, { monitorId: "left", reservedRegions: [{ x: -1220, y: 500, width: 300, height: 200 }] });
  assert.equal(engine.currentMonitor.id, "left");
  assert.ok(plan.destination.x >= -1280 + 24);
  assert.ok(plan.destination.y <= 680 - 24 - engine.profile.safeWindowSize.height);
});

test("behavior planner chooses safe companion actions from context", () => {
  const engine = new DesktopCompanionEngine();
  assert.equal(engine.tick(0.016, { speaking: true }).decision.action, "talk_gesture");
  assert.equal(engine.tick(0.016, { blockingActiveWindow: true }).decision.action, "move_aside");
  assert.equal(engine.tick(0.016, { streamMode: true }).decision.action, "stream_pose");
});

test("emotion is bounded and maps to expressions without claiming feelings", () => {
  const emotion = new EmotionState({ valence: 9, energy: 9, fatigue: -2 });
  const snapshot = emotion.snapshot();
  assert.equal(snapshot.valence, 1);
  assert.equal(snapshot.energy, 1);
  assert.equal(snapshot.fatigue, 0);
  assert.equal(snapshot.expression, "happy");
});

test("safety controller gates awareness and unsafe OS actions", () => {
  const safety = new SafetyController({ privacyMode: "basic_geometry" });
  assert.equal(safety.canUseAwareness("monitor_bounds"), true);
  assert.equal(safety.canUseAwareness("screen_pixels"), false);
  assert.equal(safety.approveAction("wave").allowed, true);
  assert.equal(safety.approveAction("click").allowed, false);
});

test("profile loading provides model-specific movement and IK defaults", () => {
  const profile = normalizeProfile({ characterId: "blueeyespark", walkSpeed: 95, ikLimits: { headYaw: 25 } });
  assert.equal(profile.characterId, "blueeyespark");
  assert.equal(profile.walkSpeed, 95);
  assert.equal(profile.safeWindowSize.width > 0, true);
  assert.equal(profile.clipMappings.walk, "walk");
});

test("engine persists recoverable state and restores to safe idle", () => {
  const engine = new DesktopCompanionEngine({ position: { x: 100, y: 100 } });
  engine.habits.updatePreference("preferredCorner", "top_left");
  const saved = engine.persistableState();
  const restored = new DesktopCompanionEngine({ position: { x: 99999, y: 99999 } });
  const inspect = restored.restore(saved);
  assert.equal(inspect.locomotion, "idle");
  assert.equal(restored.habits.data.preferredCorner, "top_left");
  assert.ok(restored.movement.position.x < 1280);
});
