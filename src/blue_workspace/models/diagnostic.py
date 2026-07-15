from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class Diagnostic:
    severity: str
    file: str
    line: int
    column: int
    source: str
    message: str

    def to_dict(self) -> dict[str, object]:
        return {
            "severity": self.severity,
            "file": self.file,
            "line": self.line,
            "column": self.column,
            "source": self.source,
            "message": self.message,
        }
