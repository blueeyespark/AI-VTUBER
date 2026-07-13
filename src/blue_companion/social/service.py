"""Permission-gated social posting queue."""
from __future__ import annotations
from uuid import uuid4
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

class SocialPostQueue:
    def draft_post(self, platform: str, text: str, media: list[str] | None = None) -> CompanionActionPlan:
        if not platform.strip():
            raise ValueError("platform is required")
        if not text.strip():
            raise ValueError("post text is required")
        return CompanionActionPlan("social_draft_post", f"Draft {platform} post", "social", ("Create a post draft only; do not publish automatically.", "Run safety, privacy, credit, and spoiler checks.", "Show final text/media to creator for approval before any upload.", "Record approval and publish result in BlueLedger."), ApprovalMode.CREATOR_REQUIRED, SafetyLevel.HIGH, {"draft_id": str(uuid4()), "platform": platform, "text": text, "media": media or []})
