"""Control center organization model."""
from __future__ import annotations

class ControlPanelPlanner:
    def sections(self) -> tuple[dict[str, object], ...]:
        return (
            {"id": "chat", "label": "Chat", "tools": ("sessions", "files", "memory", "approvals")},
            {"id": "share", "label": "Share", "tools": ("files", "folders", "links", "images", "reference packs")},
            {"id": "create", "label": "Create", "tools": ("photos", "3d", "live2d", "textures", "prompts")},
            {"id": "motion", "label": "Motion", "tools": ("walk", "run", "wave", "drag", "file interaction")},
            {"id": "stream", "label": "Stream", "tools": ("twitch", "youtube", "discord", "obs", "events")},
            {"id": "learn", "label": "Learn", "tools": ("research", "lessons", "practice", "progress")},
            {"id": "mesh", "label": "BlueMesh", "tools": ("nodes", "messages", "sync", "conflicts")},
            {"id": "security", "label": "Security", "tools": ("tokens", "permissions", "audit", "rollback")},
            {"id": "system", "label": "System", "tools": ("startup", "health", "backups", "updates")},
        )
