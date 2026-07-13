from __future__ import annotations


class BlueTrust:
    """Role and approval rules for a shared Blue identity."""

    ROLE_PERMISSIONS = {
        "Creator": {"approve_sensitive", "write_memory", "write_code", "manage_nodes", "view"},
        "Co-Creator": {"approve_sensitive", "write_memory", "write_code", "manage_nodes", "view"},
        "Steward": {"write_memory", "manage_nodes", "view"},
        "Contributor": {"write_memory", "view"},
        "Viewer": {"view"},
    }
    SENSITIVE_MODULES = {"constitution", "identity", "trusted_devices", "permissions"}
    APPROVAL_REQUIRED_SCOPES = {"constitution", "identity"}

    def can(self, role: str, permission: str) -> bool:
        return permission in self.ROLE_PERMISSIONS.get(role, set())

    def requires_approval(self, change_type: str, affected_module: str, is_overwrite: bool = False) -> bool:
        module = affected_module.lower()
        if module in self.SENSITIVE_MODULES:
            return True
        if is_overwrite and module in {"memory", "personality", "settings", "routines"}:
            return True
        if change_type.lower() in {"delete", "rollback", "constitution_update"}:
            return True
        return False

    def validate_sync_path(self, path: str) -> tuple[bool, str]:
        normalized = path.replace("\\", "/").lower()
        blocked_names = {".env", ".env.local", ".env.production"}
        if normalized.split("/")[-1] in blocked_names:
            return False, "Never sync .env files."
        if "/.git/" in normalized or normalized.endswith("/.git"):
            return False, "Never sync Git internals."
        if "token" in normalized or "secret" in normalized:
            return False, "Potential token/secret path requires manual review."
        return True, "Path allowed for normal sync."