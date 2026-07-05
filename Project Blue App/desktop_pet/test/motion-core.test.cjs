"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("screen-right movement produces a screen-right facing yaw", async () => {
  const { facingYawForDirection } = await import("../motion-core.mjs");
  assert.ok(facingYawForDirection(1, true) > 0);
  assert.ok(facingYawForDirection(-1, true) < 0);
});

test("near-vertical movement preserves the last facing direction", async () => {
  const { facingYawForDirection } = await import("../motion-core.mjs");
  assert.equal(facingYawForDirection(0.01, true, 0.58), 0.58);
  assert.equal(facingYawForDirection(0, false, 0.58), 0);
});

test("movement labels describe visible travel direction", async () => {
  const { movementLabel } = await import("../motion-core.mjs");
  assert.equal(movementLabel({ mode: "walk", x: 1 }, true), "walking right");
  assert.equal(movementLabel({ mode: "run", x: -1 }, true), "running left");
  assert.equal(movementLabel({ mode: "walk", x: 1 }, false), "resting");
});

test("gait intensity follows real movement speed", async () => {
  const { gaitProfile, normalizedMotionSpeed } = await import("../motion-core.mjs");
  assert.equal(normalizedMotionSpeed(0, "walk"), 0);
  assert.equal(normalizedMotionSpeed(82, "walk"), 1);
  assert.ok(gaitProfile(20, "walk").stride < gaitProfile(82, "walk").stride);
  assert.ok(gaitProfile(210, "run").cadence > gaitProfile(82, "walk").cadence);
});

test("smoothstep eases starts and stops without overshoot", async () => {
  const { smoothstep } = await import("../motion-core.mjs");
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});
