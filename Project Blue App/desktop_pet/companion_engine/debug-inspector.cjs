"use strict";

function inspectCompanion(engine) {
  return {
    behavior: engine.scheduler.lastAction,
    locomotion: engine.animation.state.locomotion,
    posture: engine.animation.state.posture,
    gesture: engine.animation.state.activity,
    expression: engine.emotion.expression(),
    attentionTarget: engine.attentionTarget,
    destination: engine.movement.destination,
    speed: Math.hypot(engine.movement.velocity.x, engine.movement.velocity.y),
    monitor: engine.currentMonitor?.id || "primary",
    privacyMode: engine.safety.privacyMode,
    recentActions: engine.habits.snapshot().recentActions,
    actionQueue: engine.queue.snapshot()
  };
}

module.exports = { inspectCompanion };
