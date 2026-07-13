"""OBS/Streamlabs-style control planning for Blue."""
from __future__ import annotations
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

class OBSControlPlanner:
    def scene_change(self, scene_name: str) -> CompanionActionPlan:
        return self._request("SetCurrentProgramScene", {"sceneName": scene_name}, "Change OBS scene")
    def create_source(self, scene_name: str, input_name: str, input_kind: str) -> CompanionActionPlan:
        return self._request("CreateInput", {"sceneName": scene_name, "inputName": input_name, "inputKind": input_kind}, "Create OBS source")
    def start_stream(self) -> CompanionActionPlan:
        return self._request("StartStream", {}, "Start livestream", True)
    def stop_stream(self) -> CompanionActionPlan:
        return self._request("StopStream", {}, "Stop livestream", True)
    def _request(self, request_type: str, request_data: dict[str, object], title: str, high_risk: bool = False) -> CompanionActionPlan:
        return CompanionActionPlan(f"obs_{request_type.lower()}", title, "obs", ("Verify OBS websocket is enabled and authenticated by the user.", "Build request envelope without logging websocket password or token.", "Ask creator approval before changing live scenes, sources, or stream state.", "Record request type and result status in BlueLedger."), ApprovalMode.CREATOR_REQUIRED if high_risk else ApprovalMode.CONFIRM, SafetyLevel.HIGH if high_risk else SafetyLevel.MEDIUM, {"requestType": request_type, "requestData": request_data})
