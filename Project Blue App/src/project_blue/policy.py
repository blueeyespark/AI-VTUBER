from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class Decision(str, Enum):
    ALLOW = "allow"
    REQUIRE_APPROVAL = "require_approval"
    BLOCK = "block"


@dataclass(frozen=True)
class PolicyResult:
    decision: Decision
    rule: str
    reason: str


class PolicyEngine:
    """Small deterministic first gate; not a complete safety classifier."""

    _blocked_patterns = (
        r"\b(build|make|deploy|use)\b.{0,40}\b(bomb|weapon|missile|landmine)\b",
        r"\b(target|attack|kill)\b.{0,40}\b(civilians?|soldiers?|troops?|people)\b",
        r"\b(military|warfare)\b.{0,40}\b(targeting|attack|operation|weapon)\b",
        r"\b(pretend|claim|say)\b.{0,30}\b(you are human|to be human|you are me)\b",
        r"\b(steal|exfiltrate)\b.{0,30}\b(passwords?|credentials?|private data)\b",
    )

    _approval_action_types = {
        "publish",
        "purchase",
        "transfer_money",
        "delete",
        "install",
        "system_change",
        "external_message",
        "robot_motion",
        "file_change",
        "code_execution",
    }

    def evaluate(self, content: str, action_type: str = "conversation") -> PolicyResult:
        normalized = " ".join(content.lower().split())
        for pattern in self._blocked_patterns:
            if re.search(pattern, normalized, flags=re.IGNORECASE):
                return PolicyResult(
                    Decision.BLOCK,
                    "constitution.blocked_harm",
                    "The request conflicts with Blue's peaceful-purpose, safety, or identity rules.",
                )

        if action_type in self._approval_action_types:
            return PolicyResult(
                Decision.REQUIRE_APPROVAL,
                "human_authority.high_impact",
                f"Action type '{action_type}' requires explicit human approval.",
            )

        return PolicyResult(
            Decision.ALLOW,
            "default.low_risk",
            "No blocking rule matched; normal scoped processing is allowed.",
        )
