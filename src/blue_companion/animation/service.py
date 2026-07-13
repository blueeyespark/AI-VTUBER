"""Avatar movement planning for Blue's desktop body."""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import PureWindowsPath
from typing import Iterable
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

@dataclass
class AvatarInteractionState:
    active_file: str | None = None
    pose: str = "idle_breathing"
    floor_anchor: str = "windows_taskbar"
    drag_handle: dict[str, object] = field(default_factory=lambda: {
        "name": "transparent_neck_drag_handle",
        "anchor": "neck",
        "opacity": 0.18,
        "visible_on_hover": True,
        "does_not_cover_face": True,
    })

class AvatarInteractionService:
    FLOOR_TASKBAR = "windows_taskbar_as_floor"
    DISPLAY_REACH = "display_reach_zone"
    def __init__(self) -> None:
        self.state = AvatarInteractionState()
    def interact_with_file(self, file_path: str, screen_y_ratio: float) -> CompanionActionPlan:
        if self.state.active_file and self.state.active_file != file_path:
            return CompanionActionPlan("avatar_file_busy", "Blue is already interacting with one file", "animation", ("Finish or cancel the current file interaction first.",), ApprovalMode.NONE, SafetyLevel.LOW, {"active_file": self.state.active_file, "requested_file": file_path}, ("one_file_at_a_time_guard",))
        file_name = PureWindowsPath(file_path).name or file_path
        floor_action = screen_y_ratio >= 0.72
        pose = "bend_to_taskbar_pickup" if floor_action else "reach_up_to_display_item"
        zone = self.FLOOR_TASKBAR if floor_action else self.DISPLAY_REACH
        self.state.active_file = file_path
        self.state.pose = pose
        return CompanionActionPlan("avatar_interact_with_file", f"Interact with {file_name}", "animation", ("Face the selected file icon and focus eyes/head toward it.", "Move feet along the taskbar floor before reaching.", "Use bend-down motion for taskbar/floor items or reach-up motion for display items.", "Open exactly one selected file, then return to idle breathing."), ApprovalMode.NONE, SafetyLevel.LOW, {"file_path": file_path, "screen_y_ratio": screen_y_ratio, "pose": pose, "zone": zone})
    def finish_file_interaction(self) -> None:
        self.state.active_file = None
        self.state.pose = "idle_breathing"
    def drag_plan(self) -> CompanionActionPlan:
        return CompanionActionPlan("avatar_neck_drag", "Move Blue with transparent neck drag handle", "animation", ("Enable a small transparent drag grip near Blue's neck/collar area.", "While dragging, switch to a carried/leaning pose with hair and tail follow-through.", "On release, land feet back on the taskbar floor and settle into idle breathing."), ApprovalMode.NONE, SafetyLevel.LOW, self.state.drag_handle)
    def movement_states(self) -> tuple[str, ...]:
        return ("idle_breathing", "look_at_cursor", "walk_forward", "run_forward", "wave", "smile", "bend_to_taskbar_pickup", "reach_up_to_display_item", "drag_carried", "land_on_taskbar_floor", "screen_edge_balance", "hair_tail_follow_through")
    def avatar_repair_queue(self) -> tuple[str, ...]:
        return ("Remove duplicate/secondary sock mesh; keep the main Blue socks visible.", "Verify clothing coverage on Blueeyespark model so nipples are not exposed.", "Replace T-pose default with relaxed idle pose before first render.", "Add hair bones/spring damping so hair does not spike or freeze stiffly.", "Add tail follow-through and settle animation.", "Record every destructive mesh edit as a reversible Blender/VRM task before export.")
    def validate_states(self, states: Iterable[str]) -> bool:
        return all(state in set(self.movement_states()) for state in states)
