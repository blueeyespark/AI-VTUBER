from __future__ import annotations
from dataclasses import dataclass, field
from time import time
from typing import Any

@dataclass(frozen=True)
class ToolCallRecord:
    tool: str
    target: str
    action: str
    status: str = "ok"
    duration_ms: int = 0
    result: Any = None
    error: str = ""
    timestamp: float = field(default_factory=time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "target": self.target,
            "action": self.action,
            "status": self.status,
            "duration_ms": self.duration_ms,
            "result": self.result,
            "error": self.error,
            "timestamp": self.timestamp,
        }
