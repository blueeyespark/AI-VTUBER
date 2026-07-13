"""Shared models for Project Blue's companion platform.

The companion package builds approval-gated plans. It does not connect to
Discord, OBS, Twitch, social networks, or generation services directly, so the
control center can preview actions before anything external happens.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping

class CapabilityStatus(str, Enum):
    BUILT = "built"
    PROTOTYPE = "prototype"
    PLANNED = "planned"
    BLOCKED = "blocked"

class SafetyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class ApprovalMode(str, Enum):
    NONE = "none"
    CONFIRM = "confirm"
    CREATOR_REQUIRED = "creator_required"

@dataclass(frozen=True)
class CompanionCapability:
    key: str
    name: str
    category: str
    status: CapabilityStatus
    safety: SafetyLevel
    approval: ApprovalMode
    summary: str
    stores_data: bool = False
    needs_token: bool = False
    source_notes: tuple[str, ...] = ()
    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "category": self.category,
            "status": self.status.value,
            "safety": self.safety.value,
            "approval": self.approval.value,
            "summary": self.summary,
            "stores_data": self.stores_data,
            "needs_token": self.needs_token,
            "source_notes": list(self.source_notes),
        }

@dataclass(frozen=True)
class CompanionActionPlan:
    action_id: str
    title: str
    category: str
    steps: tuple[str, ...]
    approval: ApprovalMode = ApprovalMode.CONFIRM
    safety: SafetyLevel = SafetyLevel.MEDIUM
    inputs: Mapping[str, Any] = field(default_factory=dict)
    blocked_reasons: tuple[str, ...] = ()
    @property
    def is_blocked(self) -> bool:
        return bool(self.blocked_reasons)
    def to_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "title": self.title,
            "category": self.category,
            "steps": list(self.steps),
            "approval": self.approval.value,
            "safety": self.safety.value,
            "inputs": dict(self.inputs),
            "blocked_reasons": list(self.blocked_reasons),
            "is_blocked": self.is_blocked,
        }

@dataclass(frozen=True)
class CompanionPrototypeSummary:
    blue_identity_rule: str
    capabilities: int
    generated_plans: tuple[CompanionActionPlan, ...]
    notes: tuple[str, ...]
    def to_dict(self) -> dict[str, Any]:
        return {
            "blue_identity_rule": self.blue_identity_rule,
            "capabilities": self.capabilities,
            "generated_plans": [p.to_dict() for p in self.generated_plans],
            "notes": list(self.notes),
        }
