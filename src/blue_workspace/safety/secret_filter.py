from __future__ import annotations
import re

SECRET_PATTERNS = (
    re.compile(r"(?i)(api[_-]?key|token|secret|password|credential)\s*[:=]\s*[^\s]+"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"),
)

class SecretFilter:
    def redact(self, value: str) -> str:
        result = value
        for pattern in SECRET_PATTERNS:
            result = pattern.sub("[REDACTED]", result)
        return result

    def looks_sensitive_path(self, path: str) -> bool:
        lowered = path.lower().replace("\\", "/")
        return lowered == ".env" or lowered.endswith("/.env") or any(part in lowered for part in ("secret", "credential", "token", "private_key"))

