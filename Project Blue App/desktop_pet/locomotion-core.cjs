"use strict";

function finitePoint(value, fallback = { x: 0, y: 0 }) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { ...fallback };
}

function moveToward(current, target, maximumDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

function advanceLocomotion(state, target, deltaSeconds, options = {}) {
  const position = finitePoint(state?.position);
  const velocity = finitePoint(state?.velocity);
  const destination = finitePoint(target, position);
  const delta = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.1));
  const maxSpeed = Math.max(1, Number(options.maxSpeed) || 82);
  const acceleration = Math.max(1, Number(options.acceleration) || maxSpeed * 3.2);
  const deceleration = Math.max(1, Number(options.deceleration) || maxSpeed * 4.2);
  const arrivalRadius = Math.max(0.5, Number(options.arrivalRadius) || 3);
  const dx = destination.x - position.x;
  const dy = destination.y - position.y;
  const distance = Math.hypot(dx, dy);
  const speed = Math.hypot(velocity.x, velocity.y);

  if (!Number.isFinite(distance)) {
    return { position, velocity: { x: 0, y: 0 }, speed: 0, arrived: true,
      direction: { x: 0, y: 0 }, turn: 0, braking: true };
  }

  const direction = distance > 1e-6
    ? { x: dx / distance, y: dy / distance }
    : { x: 0, y: 0 };
  const stoppingDistance = (speed * speed) / (2 * deceleration);
  const braking = distance <= Math.max(arrivalRadius * 2, stoppingDistance + arrivalRadius);
  const targetSpeed = braking
    ? Math.min(maxSpeed, Math.sqrt(Math.max(0, 2 * deceleration * (distance - arrivalRadius))))
    : maxSpeed;
  const desiredVelocity = {
    x: direction.x * targetSpeed,
    y: direction.y * targetSpeed
  };
  const rate = targetSpeed < speed ? deceleration : acceleration;
  let nextVelocity = {
    x: moveToward(velocity.x, desiredVelocity.x, rate * delta),
    y: moveToward(velocity.y, desiredVelocity.y, rate * delta)
  };
  let nextSpeed = Math.hypot(nextVelocity.x, nextVelocity.y);

  // Limit diagonal acceleration to the same envelope as axial acceleration.
  const maximumVelocity = Math.max(maxSpeed, targetSpeed);
  if (nextSpeed > maximumVelocity) {
    const scale = maximumVelocity / nextSpeed;
    nextVelocity.x *= scale;
    nextVelocity.y *= scale;
    nextSpeed = maximumVelocity;
  }

  const previousHeading = speed > 1 ? Math.atan2(velocity.y, velocity.x) : null;
  const nextHeading = nextSpeed > 1 ? Math.atan2(nextVelocity.y, nextVelocity.x) : previousHeading;
  let turn = 0;
  if (previousHeading !== null && nextHeading !== null) {
    turn = Math.atan2(
      Math.sin(nextHeading - previousHeading),
      Math.cos(nextHeading - previousHeading)
    );
  }

  const travel = nextSpeed * delta;
  if (distance <= arrivalRadius || travel >= Math.max(0, distance - arrivalRadius)) {
    return {
      position: { ...destination },
      velocity: { x: 0, y: 0 },
      speed: 0,
      arrived: true,
      direction,
      turn,
      braking: true
    };
  }

  const nextPosition = {
    x: position.x + nextVelocity.x * delta,
    y: position.y + nextVelocity.y * delta
  };
  return {
    position: nextPosition,
    velocity: nextVelocity,
    speed: nextSpeed,
    arrived: false,
    direction: nextSpeed > 1
      ? { x: nextVelocity.x / nextSpeed, y: nextVelocity.y / nextSpeed }
      : direction,
    turn,
    braking
  };
}

module.exports = { advanceLocomotion, moveToward };
