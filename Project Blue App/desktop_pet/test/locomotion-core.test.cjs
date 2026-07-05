"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { advanceLocomotion } = require("../locomotion-core.cjs");

test("locomotion accelerates instead of jumping to maximum speed", () => {
  const result = advanceLocomotion(
    { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
    { x: 1000, y: 0 },
    0.1,
    { maxSpeed: 100, acceleration: 200, deceleration: 300 }
  );
  assert.ok(result.speed > 0);
  assert.ok(result.speed < 100);
  assert.ok(result.position.x > 0);
});

test("locomotion brakes before the destination and arrives without overshoot", () => {
  let state = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
  let result;
  for (let index = 0; index < 500; index += 1) {
    result = advanceLocomotion(state, { x: 120, y: 0 }, 1 / 60, {
      maxSpeed: 90, acceleration: 240, deceleration: 320, arrivalRadius: 2
    });
    state = { position: result.position, velocity: result.velocity };
    assert.ok(result.position.x <= 120);
    if (result.arrived) break;
  }
  assert.equal(result.arrived, true);
  assert.deepEqual(result.position, { x: 120, y: 0 });
  assert.equal(result.speed, 0);
});

test("direction changes curve through velocity rather than teleporting heading", () => {
  const result = advanceLocomotion(
    { position: { x: 0, y: 0 }, velocity: { x: 80, y: 0 } },
    { x: 0, y: 500 },
    1 / 60,
    { maxSpeed: 100, acceleration: 180, deceleration: 240 }
  );
  assert.ok(result.velocity.x > 0);
  assert.ok(result.velocity.y > 0);
  assert.ok(result.turn > 0);
});

test("invalid timing remains bounded and finite", () => {
  const result = advanceLocomotion(
    { position: { x: 5, y: 7 }, velocity: { x: 1, y: 2 } },
    { x: 20, y: 30 },
    Number.NaN
  );
  assert.ok(Number.isFinite(result.position.x));
  assert.ok(Number.isFinite(result.position.y));
});
