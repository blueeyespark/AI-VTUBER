from __future__ import annotations
from hashlib import sha256
from blue_workspace.safety import PathPolicy, SecretFilter

class FileReaderTool:
    def __init__(self, policy: PathPolicy, secrets: SecretFilter | None = None):
        self.policy = policy
        self.secrets = secrets or SecretFilter()

    def read_text(self, path: str, max_chars: int = 20000) -> dict[str, object]:
        if self.secrets.looks_sensitive_path(path):
            raise PermissionError(f"Sensitive file paths are not read automatically: {path}")
        resolved = self.policy.resolve_inside(path)
        if not resolved.is_file():
            raise FileNotFoundError(path)
        if not self.policy.is_probably_text(resolved):
            raise ValueError(f"Refusing to read probable binary/archive file as text: {path}")
        raw = resolved.read_bytes()
        text = raw.decode("utf-8", errors="replace")
        limited = text[:max_chars]
        return {
            "path": str(resolved.relative_to(self.policy.workspace_root)).replace("\\", "/"),
            "sha256": sha256(raw).hexdigest(),
            "chars": len(text),
            "truncated": len(text) > len(limited),
            "text": self.secrets.redact(limited),
        }
