from __future__ import annotations

class WorkspaceVerifier:
    def phase_one_checks(self) -> dict[str, object]:
        return {"read_only": True, "writes_enabled": False, "approval_required_for_edits": True}
