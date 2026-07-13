"use strict";

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value, fallback = { x: 0, y: 0 }) {
  return { x: finiteNumber(value?.x, fallback.x), y: finiteNumber(value?.y, fallback.y) };
}

function rect(value, fallback = { x: 0, y: 0, width: 100, height: 100 }) {
  return {
    x: finiteNumber(value?.x, fallback.x),
    y: finiteNumber(value?.y, fallback.y),
    width: Math.max(1, finiteNumber(value?.width, fallback.width)),
    height: Math.max(1, finiteNumber(value?.height, fallback.height))
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function insetRect(area, margin = 0) {
  const safe = rect(area);
  const m = Math.max(0, finiteNumber(margin, 0));
  return {
    x: safe.x + m,
    y: safe.y + m,
    width: Math.max(1, safe.width - m * 2),
    height: Math.max(1, safe.height - m * 2)
  };
}

function clampPointToRect(value, area, size = { width: 1, height: 1 }) {
  const p = point(value);
  const r = rect(area);
  const w = Math.max(1, finiteNumber(size.width, 1));
  const h = Math.max(1, finiteNumber(size.height, 1));
  return {
    x: clamp(p.x, r.x, r.x + Math.max(0, r.width - w)),
    y: clamp(p.y, r.y, r.y + Math.max(0, r.height - h))
  };
}

function intersects(a, b) {
  const left = rect(a);
  const right = rect(b);
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function distance(a, b) {
  const p = point(a);
  const q = point(b);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

module.exports = { finiteNumber, point, rect, clamp, insetRect, clampPointToRect, intersects, distance };
