"""Local schedule planning for Blue."""
from __future__ import annotations
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

class SchedulePlanner:
    def plan_routine(self, title: str, cadence: str, tasks: list[str]) -> CompanionActionPlan:
        if not title.strip() or not cadence.strip() or not tasks:
            raise ValueError("title, cadence, and at least one task are required")
        return CompanionActionPlan("schedule_plan_routine", f"Schedule routine: {title}", "scheduling", ("Create a local schedule record in Blue's database.", "Sync schedule metadata through BlueMesh if approved.", "Notify the creator before due tasks; never control accounts or PC power without approval."), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, {"title": title, "cadence": cadence, "tasks": tasks})
