"""Reference-aware art, 3D, and Live2D planning."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import PureWindowsPath
from uuid import uuid4
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

@dataclass(frozen=True)
class ReferenceItem:
    path: str
    role: str
    weight: float

class CreationPipelinePlanner:
    def reference_pack(self, references: list[ReferenceItem]) -> CompanionActionPlan:
        if not references:
            return CompanionActionPlan("creation_reference_pack_empty", "Build reference pack", "creation", ("Add at least one user-provided reference image, video, model, or notes file.",), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, blocked_reasons=("no_references",))
        normalized = [{"path": r.path, "name": PureWindowsPath(r.path).name or r.path, "role": r.role, "weight": min(max(r.weight, 0.0), 1.0)} for r in references]
        return CompanionActionPlan("creation_reference_pack", "Create reference-aware generation manifest", "creation", ("Classify each reference as identity, outfit, pose, color, expression, background, or negative reference.", "Create a weighted manifest so too many references do not collapse into one confused prompt.", "Ask for approval before generating images, textures, VRM edits, Blender edits, or Live2D assets.", "Store prompt, references, hashes, and output lineage for repeatability."), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, {"manifest_id": str(uuid4()), "references": normalized, "reference_count": len(normalized)})
    def model_pipeline(self, target: str = "blueeyespark") -> CompanionActionPlan:
        return CompanionActionPlan("creation_model_pipeline", f"3D/Live2D production pipeline for {target}", "creation", ("Audit source files: VRM, Blender archive, textures, reference images, and license/commission notes.", "Create reversible repair tasks for clothes, duplicate socks, hair physics, tail physics, expressions, and idle pose.", "Export candidate VRM/Live2D builds into versioned asset folders instead of overwriting originals.", "Run visual smoke tests before installing the avatar into the desktop pet."), ApprovalMode.CONFIRM, SafetyLevel.MEDIUM, {"target": target, "overwrite_originals": False})
