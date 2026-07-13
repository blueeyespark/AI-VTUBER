"""Source-backed research planning for Blue upgrades."""
from __future__ import annotations
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

class ResearchPlanner:
    def upgrade_research(self, topic: str, sources: list[str]) -> CompanionActionPlan:
        if not topic.strip():
            raise ValueError("topic is required")
        return CompanionActionPlan("research_upgrade_topic", f"Research Blue upgrade: {topic}", "research", ("Collect current official docs, papers, or primary sources where possible.", "Extract capabilities, constraints, safety requirements, and implementation options.", "Write a build note and split immediate prototype work from future roadmap work.", "Require creator approval before code, public-account, or shared-memory changes."), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, {"topic": topic, "sources": sources})
