from __future__ import annotations


ROLE_LEVELS = {
    "Viewer": 0,
    "Contributor": 1,
    "Steward": 2,
    "Co-Creator": 3,
    "Creator": 4,
}

SENSITIVE_MODULES = {
    "BlueIdentity",
    "BlueTrust",
    "Constitution",
    "constitution",
    "identity",
    "trust",
}


class BlueTrustService:
    """Permission and approval policy for multi-creator Blue."""

    def role_level(self, role: str) -> int:
        return ROLE_LEVELS.get(role, -1)

    def can_approve(self, role: str) -> bool:
        return self.role_level(role) >= ROLE_LEVELS["Steward"]

    def requires_approval(self, *, affected_module: str, change_type: str) -> bool:
        normalized_change = change_type.lower()
        if affected_module in SENSITIVE_MODULES:
            return True
        if "overwrite" in normalized_change:
            return True
        if "constitution" in normalized_change:
            return True
        return False

    def approval_status_for(self, *, affected_module: str, change_type: str, requested_status: str) -> str:
        if self.requires_approval(affected_module=affected_module, change_type=change_type):
            return requested_status if requested_status == "approved" else "requires_approval"
        return requested_status or "approved"
