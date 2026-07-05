export function facingYawForDirection(directionX, walking, previousYaw = 0) {
  if (!walking) return 0;
  const x = Number(directionX);
  if (!Number.isFinite(x) || Math.abs(x) < 0.04) return previousYaw;
  // Positive screen X must turn Blue toward screen-right. The old renderer
  // used the opposite sign, which made every stride look backward.
  return x > 0 ? 0.58 : -0.58;
}

export function movementLabel(motion, walking) {
  if (!walking) return "resting";
  const mode = motion?.mode === "run" ? "running" : "walking";
  const x = Number(motion?.x);
  if (!Number.isFinite(x) || Math.abs(x) < 0.04) return mode;
  return `${mode} ${x > 0 ? "right" : "left"}`;
}

export function normalizedMotionSpeed(speed, mode = "walk") {
  const maximum = mode === "run" ? 210 : 82;
  const value = Number(speed);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / maximum);
}

export function gaitProfile(speed, mode = "walk") {
  const normalized = normalizedMotionSpeed(speed, mode);
  const running = mode === "run" ? normalized : 0;
  return {
    weight: smoothstep(0.025, 0.24, normalized),
    cadence: 3.4 + normalized * 2.4 + running * 2.2,
    stride: (0.16 + normalized * 0.22 + running * 0.20) * normalized,
    knee: (0.18 + normalized * 0.18 + running * 0.20) * normalized,
    arm: (0.08 + normalized * 0.13 + running * 0.14) * normalized,
    bounce: (0.006 + normalized * 0.012 + running * 0.010) * normalized
  };
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}
