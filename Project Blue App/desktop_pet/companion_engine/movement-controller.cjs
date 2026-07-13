"use strict";

const { clampPointToRect, insetRect, rect, distance } = require("./geometry.cjs");
const { advanceLocomotion } = require("../locomotion-core.cjs");

class MultiMonitorController {
  constructor(monitors = []) { this.update(monitors); }
  update(monitors = []) {
    this.monitors = monitors.length ? monitors.map((m, index) => ({ id: m.id || `monitor_${index}`, bounds: rect(m.bounds || m), workArea: rect(m.workArea || m.bounds || m) })) : [{ id: "primary", bounds: rect({ x: 0, y: 0, width: 1280, height: 720 }), workArea: rect({ x: 0, y: 0, width: 1280, height: 680 }) }];
    return this.monitors;
  }
  workAreaFor(id) { return (this.monitors.find(m => m.id === id) || this.monitors[0]).workArea; }
  nearestMonitor(point) { return this.monitors.slice().sort((a, b) => distance(point, a.workArea) - distance(point, b.workArea))[0]; }
}

class NavigationSystem {
  constructor({ margin = 24 } = {}) { this.margin = margin; this.recentDestinations = []; }
  safeArea(workArea) { return insetRect(workArea, this.margin); }
  chooseRestingZone(workArea, petSize, habits = {}) {
    const safe = this.safeArea(workArea);
    const zones = [
      { x: safe.x, y: safe.y + safe.height - petSize.height },
      { x: safe.x + safe.width - petSize.width, y: safe.y + safe.height - petSize.height },
      { x: safe.x + safe.width - petSize.width, y: safe.y },
      { x: safe.x, y: safe.y }
    ];
    const preferred = habits.preferredCorner || "bottom_right";
    const order = { bottom_left: 0, bottom_right: 1, top_right: 2, top_left: 3 };
    return clampPointToRect(zones[order[preferred] ?? 1], safe, petSize);
  }
  planPath(current, destination, workArea, petSize, reserved = []) {
    const safe = this.safeArea(workArea);
    const start = clampPointToRect(current, safe, petSize);
    let end = clampPointToRect(destination, safe, petSize);
    const petRect = p => ({ x: p.x, y: p.y, width: petSize.width, height: petSize.height });
    for (const region of reserved) {
      const r = rect(region);
      const overlaps = !(end.x + petSize.width <= r.x || end.x >= r.x + r.width || end.y + petSize.height <= r.y || end.y >= r.y + r.height);
      if (overlaps) end = clampPointToRect({ x: r.x - petSize.width - this.margin, y: end.y }, safe, petSize);
    }
    const waypoints = [start];
    if (reserved.some(region => distance(start, region) < this.margin * 2 || distance(end, region) < this.margin * 2)) {
      waypoints.push(clampPointToRect({ x: start.x, y: end.y }, safe, petSize));
    }
    waypoints.push(end);
    this.recentDestinations.push(end);
    this.recentDestinations = this.recentDestinations.slice(-12);
    return { start, destination: end, waypoints };
  }
}

class MovementController {
  constructor({ position = { x: 0, y: 0 }, petSize = { width: 240, height: 520 }, profile = {} } = {}) {
    this.position = position;
    this.velocity = { x: 0, y: 0 };
    this.petSize = petSize;
    this.profile = { walkSpeed: 82, runSpeed: 180, acceleration: 260, deceleration: 340, ...profile };
    this.mode = "idle";
    this.destination = position;
  }
  setDestination(destination, mode = "walk") { this.destination = destination; this.mode = mode; }
  tick(deltaSeconds) {
    const maxSpeed = this.mode === "run" ? this.profile.runSpeed : this.profile.walkSpeed;
    const next = advanceLocomotion({ position: this.position, velocity: this.velocity }, this.destination, deltaSeconds, { maxSpeed, acceleration: this.profile.acceleration, deceleration: this.profile.deceleration });
    this.position = next.position;
    this.velocity = next.velocity;
    if (next.arrived) this.mode = "idle";
    return { ...next, mode: this.mode };
  }
  clampTo(workArea) { this.position = clampPointToRect(this.position, workArea, this.petSize); return this.position; }
}

module.exports = { MultiMonitorController, NavigationSystem, MovementController };
