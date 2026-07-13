"""Approval-gated AI-to-AI and creator-to-creator messaging."""
from __future__ import annotations
import re
from dataclasses import dataclass
from uuid import uuid4
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel
_TOKEN_PATTERN = re.compile(r"(token|secret|password|credential|api[_-]?key)", re.IGNORECASE)

@dataclass(frozen=True)
class PendingBlueMessage:
    message_id: str
    target: str
    body: str
    route: str
    approval_required: bool = True

class BlueMessageRelay:
    def draft_message(self, target: str, body: str, route: str = "BlueMesh") -> PendingBlueMessage:
        clean_target = target.strip().lower()
        if not clean_target:
            raise ValueError("target is required")
        if not body.strip():
            raise ValueError("message body is required")
        if _TOKEN_PATTERN.search(body):
            raise ValueError("message appears to contain sensitive credential text")
        return PendingBlueMessage(str(uuid4()), clean_target, body.strip(), route)
    def plan_send(self, pending: PendingBlueMessage) -> CompanionActionPlan:
        return CompanionActionPlan("message_trusted_ai_user", f"Send message to {pending.target}", "messaging", ("Show the exact message to the creator for approval.", "Send through BlueMesh relay or approved local network bridge.", "Append delivery status to BlueLedger without storing tokens."), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, {"message_id": pending.message_id, "target": pending.target, "route": pending.route, "body_preview": pending.body[:160], "approval_required": pending.approval_required})
