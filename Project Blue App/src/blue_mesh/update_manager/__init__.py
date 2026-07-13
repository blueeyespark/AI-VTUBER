from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


class BlueUpdateManager:
    """GitHub-aware update planner with approval and rollback guardrails."""

    def __init__(self, repo_path: str | Path):
        self.repo_path = Path(repo_path)

    def _git(self, *args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=self.repo_path,
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def local_head(self) -> str:
        return self._git("rev-parse", "HEAD")

    def tracking_head(self, branch: str = "origin/main") -> str:
        return self._git("rev-parse", branch)

    def check_version(self, branch: str = "origin/main") -> dict[str, Any]:
        local = self.local_head()
        remote = self.tracking_head(branch)
        return {
            "local_head": local,
            "remote_head": remote,
            "update_available": local != remote,
            "branch": branch,
        }

    def plan_pull(self, approval_status: str) -> dict[str, Any]:
        if approval_status != "approved":
            return {
                "status": "approval_required",
                "reason": "Pulling code updates can change Blue behavior.",
            }
        return {
            "status": "ready",
            "commands": [["git", "fetch", "origin"], ["git", "pull", "--ff-only"]],
        }

    def plan_rollback(self, stable_revision: str, approval_status: str) -> dict[str, Any]:
        if approval_status != "approved":
            return {
                "status": "approval_required",
                "reason": "Rollback changes code state and requires creator approval.",
            }
        return {
            "status": "ready",
            "stable_revision": stable_revision,
            "commands": [["git", "checkout", stable_revision]],
        }