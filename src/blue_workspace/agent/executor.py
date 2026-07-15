from __future__ import annotations
from blue_workspace.models import ExecutionResult

class WorkspaceExecutor:
    def explain_read_only_phase(self) -> ExecutionResult:
        return ExecutionResult(True, "BlueWorkspaceAgent Phase 1 is read-only: inspect, search, index, diagnostics, and Git status are enabled; file editing waits for approval-gated Phase 2.")
