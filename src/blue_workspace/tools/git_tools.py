from __future__ import annotations
import subprocess
from blue_workspace.safety import PathPolicy, SecretFilter

class GitTools:
    def __init__(self, policy: PathPolicy):
        self.policy = policy
        self.secrets = SecretFilter()

    def _git(self, args: list[str], timeout: int = 10) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["git", "-c", f"safe.directory={self.policy.workspace_root}", *args], cwd=self.policy.workspace_root, text=True, capture_output=True, timeout=timeout)

    def repository_root(self) -> str | None:
        result = self._git(["rev-parse", "--show-toplevel"])
        if result.returncode != 0:
            return None
        return result.stdout.strip()

    def branch(self) -> str:
        result = self._git(["branch", "--show-current"])
        return result.stdout.strip() if result.returncode == 0 else ""

    def status(self) -> dict[str, object]:
        result = self._git(["status", "--short"])
        lines = result.stdout.splitlines() if result.returncode == 0 else []
        return {"ok": result.returncode == 0, "branch": self.branch(), "modified_files": len(lines), "files": lines[:200], "error": self.secrets.redact(result.stderr.strip())}

    def diff_summary(self) -> dict[str, object]:
        result = self._git(["diff", "--stat"])
        return {"ok": result.returncode == 0, "summary": self.secrets.redact(result.stdout.strip()), "error": self.secrets.redact(result.stderr.strip())}
