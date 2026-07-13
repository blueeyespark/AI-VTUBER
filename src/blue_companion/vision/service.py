"""Vision/image intake planning for Blue."""
from __future__ import annotations
from pathlib import PureWindowsPath
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

class VisionIntakePlanner:
    SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".mp4", ".webm"}
    def analyze_user_file(self, path: str, purpose: str = "describe") -> CompanionActionPlan:
        suffix = PureWindowsPath(path).suffix.lower()
        blocked = []
        if not path.strip():
            blocked.append("no_user_file_selected")
        if suffix and suffix not in self.SUPPORTED_EXTENSIONS:
            blocked.append("unsupported_visual_extension")
        return CompanionActionPlan("vision_analyze_user_file", "Analyze user-provided visual file", "vision", ("Copy or index only the user-selected file/folder with provenance.", "Run OCR, object/scene description, character/reference extraction, and safety notes.", "Store bounded summary and source hash; keep originals in the private inbox/archive."), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, {"path": path, "purpose": purpose}, tuple(blocked))
    def hidden_capture_guard(self) -> CompanionActionPlan:
        return CompanionActionPlan("vision_hidden_capture_guard", "Block hidden vision capture", "vision", ("Reject camera/screen capture unless the creator explicitly turns it on.", "Show a visible status badge while capture is active.", "Log start, stop, source, and retention policy in BlueLedger."), ApprovalMode.CREATOR_REQUIRED, SafetyLevel.HIGH, {"hidden_capture_allowed": False})
