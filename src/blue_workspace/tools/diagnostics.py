from __future__ import annotations
from blue_workspace.models import Diagnostic

class DiagnosticsTool:
    def current(self) -> list[dict[str, object]]:
        return []

    def from_test_output(self, text: str) -> list[dict[str, object]]:
        diagnostics = []
        for index, line in enumerate(text.splitlines(), start=1):
            lowered = line.lower()
            if "error" in lowered or "failed" in lowered:
                diagnostics.append(Diagnostic("error", "terminal", index, 1, "test-output", line.strip()).to_dict())
        return diagnostics
