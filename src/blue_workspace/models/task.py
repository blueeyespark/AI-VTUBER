from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from time import time
from typing import Any
from uuid import uuid4

class AgentMode(str, Enum):
    PLAN = "plan"
    ASK_BEFORE_CHANGES = "ask_before_changes"
    AUTO_APPROVE_LOW_RISK = "auto_approve_low_risk"

class TaskStatus(str, Enum):
    ANALYZING = "analyzing"
    PLANNED = "planned"
    AWAITING_APPROVAL = "awaiting_approval"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    BLOCKED = "blocked"
    COMPLETE = "complete"
    FAILED = "failed"
    CANCELED = "canceled"

@dataclass
class WorkspaceTask:
    title: str
    request: str
    status: TaskStatus = TaskStatus.ANALYZING
    mode: AgentMode = AgentMode.PLAN
    task_id: str = field(default_factory=lambda: f"task_{uuid4().hex[:12]}")
    plan: list[str] = field(default_factory=list)
    files_in_scope: list[str] = field(default_factory=list)
    approvals: list[dict[str, Any]] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    verification_results: list[dict[str, Any]] = field(default_factory=list)
    created_at: float = field(default_factory=time)
    updated_at: float = field(default_factory=time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "title": self.title,
            "request": self.request,
            "status": self.status.value,
            "mode": self.mode.value,
            "plan": list(self.plan),
            "files_in_scope": list(self.files_in_scope),
            "approvals": list(self.approvals),
            "tool_calls": list(self.tool_calls),
            "verification_results": list(self.verification_results),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
