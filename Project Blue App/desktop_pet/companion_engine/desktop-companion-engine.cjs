"use strict";

const { AnimationStateMachine } = require("./animation-state-machine.cjs");
const { BehaviorScheduler } = require("./behavior-planner.cjs");
const { EmotionState } = require("./emotion-state.cjs");
const { HabitMemory } = require("./habit-memory.cjs");
const { MovementController, MultiMonitorController, NavigationSystem } = require("./movement-controller.cjs");
const { SafetyController } = require("./safety-controller.cjs");
const { ActionQueue } = require("./behavior-planner.cjs");
const { normalizeProfile } = require("./model-profile.cjs");
const { inspectCompanion } = require("./debug-inspector.cjs");

class DesktopCompanionEngine {
  constructor(options = {}) {
    this.profile = normalizeProfile(options.profile || {});
    this.monitors = new MultiMonitorController(options.monitors);
    this.navigation = new NavigationSystem(options.navigation);
    this.habits = new HabitMemory(options.habits);
    this.emotion = new EmotionState(options.emotion);
    this.safety = new SafetyController(options.safety);
    this.scheduler = new BehaviorScheduler();
    this.animation = new AnimationStateMachine();
    this.queue = new ActionQueue();
    this.currentMonitor = this.monitors.monitors[0];
    this.attentionTarget = "idle_scan";
    this.movement = new MovementController({ petSize: this.profile.safeWindowSize, profile: this.profile, position: options.position || { x: 0, y: 0 } });
    this.movement.clampTo(this.currentMonitor.workArea);
  }

  setHome() {
    const area = this.monitors.workAreaFor(this.habits.data.preferredMonitor);
    const home = this.navigation.chooseRestingZone(area, this.profile.safeWindowSize, this.habits.data);
    this.movement.setDestination(home, "walk");
    return home;
  }

  planDestination(destination, options = {}) {
    const monitor = options.monitorId ? this.monitors.monitors.find(m => m.id === options.monitorId) : this.monitors.nearestMonitor(destination);
    this.currentMonitor = monitor || this.currentMonitor;
    const plan = this.navigation.planPath(this.movement.position, destination, this.currentMonitor.workArea, this.profile.safeWindowSize, options.reservedRegions || []);
    this.movement.setDestination(plan.destination, options.mode || "walk");
    return plan;
  }

  tick(deltaSeconds = 1 / 60, context = {}) {
    const decision = this.scheduler.tick({ ...context, emotion: this.emotion.snapshot() });
    this.habits.recordAction(decision.action);
    if (decision.action === "move_aside") this.setHome();
    if (decision.action === "sleep") this.animation.transition({ posture: "sleep", activity: "think", face: "sleepy" }, "planner");
    const motion = this.movement.tick(deltaSeconds);
    this.animation.setFromMotion({ speed: motion.speed, dragged: context.dragged, speaking: context.speaking, listening: context.listening });
    return { decision, motion, animation: this.animation.snapshot(), emotion: this.emotion.snapshot() };
  }

  restore(state = {}) {
    if (state.habits) this.habits = new HabitMemory(state.habits);
    if (state.position) this.movement.position = state.position;
    this.movement.clampTo(this.currentMonitor.workArea);
    this.animation.transition({ locomotion: "idle", posture: "stand", activity: "listen" }, "restore");
    return this.inspect();
  }

  persistableState() { return { profile: this.profile, habits: this.habits.snapshot(), position: this.movement.position, destination: this.movement.destination }; }
  inspect() { return inspectCompanion(this); }
}

module.exports = { DesktopCompanionEngine };
