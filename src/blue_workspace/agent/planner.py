from __future__ import annotations

class WorkspacePlanner:
    def plan(self, request: str) -> list[str]:
        lowered = request.lower()
        steps = ["Inspect workspace context", "Gather only relevant files or search results"]
        if any(word in lowered for word in ("fix", "edit", "change", "combine", "implement")):
            steps += ["Prepare a proposed change set", "Request approval before modifying files", "Verify with relevant tests after approval"]
        elif any(word in lowered for word in ("search", "find", "reference")):
            steps += ["Run read-only code search", "Return clickable file and line references"]
        elif "test" in lowered or "build" in lowered:
            steps += ["Preview verification commands", "Ask before running commands that may write caches"]
        else:
            steps += ["Explain findings with evidence", "Offer next safe actions"]
        return steps
