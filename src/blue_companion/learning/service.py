"""Teaching and research plans for Blue."""
from __future__ import annotations
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

class LearningPlanner:
    def teach_topic(self, topic: str, learner_goal: str = "beginner friendly") -> CompanionActionPlan:
        if not topic.strip():
            raise ValueError("topic is required")
        return CompanionActionPlan("learning_teach_topic", f"Teach: {topic}", "learning", ("Research the topic with source notes and date stamps.", "Build a short lesson with definitions, examples, and what to practice first.", "Give the learner one small exercise and one stretch challenge.", "Check understanding, adapt the next lesson, and save progress to BlueMesh memory with approval."), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, {"topic": topic.strip(), "learner_goal": learner_goal})
