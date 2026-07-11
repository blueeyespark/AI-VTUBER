from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from ..ledger import BlueLedgerService


SAFE_GIT_REF = re.compile(r"^[A-Za-z0-9._/@-]{4,160}$")


class BlueUpdateManager:
    """GitHub update checker with approval-gated pull and rollback hooks."""

    def __init__(self, ledger: BlueLedgerService):
        self.ledger = ledger

    def _reject_credential_url(self, repo_url: str) -> None:
        authority = repo_url.split("://", 1)[-1].split("/", 1)[0]
        if "@" in authority:
            raise ValueError("Repository URLs with embedded credentials are not allowed.")

    def _git(self, repo_path: str | Path, args: list[str], timeout_seconds: int = 30) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=Path(repo_path),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=True,
        )
        return result.stdout.strip()

    def local_head(self, repo_path: str | Path) -> str:
        return self._git(repo_path, ["rev-parse", "HEAD"], timeout_seconds=15)

    def remote_head(
        self,
        repo_url: str = "https://github.com/blueeyespark/AI-VTUBER.git",
        branch: str = "main",
        timeout_seconds: int = 20,
    ) -> str:
        self._reject_credential_url(repo_url)
        result = subprocess.run(
            ["git", "ls-remote", repo_url, f"refs/heads/{branch}"],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=True,
        )
        return result.stdout.split()[0]

    def check_for_update(self, *, repo_path: str | Path, repo_url: str, branch: str = "main") -> dict[str, object]:
        local = self.local_head(repo_path)
        remote = self.remote_head(repo_url=repo_url, branch=branch)
        update = {
            "local_head": local,
            "remote_head": remote,
            "update_available": local != remote,
            "branch": branch,
        }
        self.ledger.append_change(
            node_id=None,
            creator_id=None,
            change_type="github_update_check",
            affected_module="BlueUpdateManager",
            record_key=branch,
            before_state=None,
            after_state=update,
            approval_status="approved",
        )
        return update

    def _shared_upgrade_plan(
        self,
        *,
        approved: bool,
        approvals: dict[str, bool] | None = None,
        required_approvals: int = 2,
    ) -> dict[str, Any]:
        if not approved:
            return {"status": "requires_approval", "reason": "Pulling updates can change Blue behavior."}
        if approvals is None:
            approvals = {}
        approved_count = sum(1 for value in approvals.values() if value)
        if approved_count < required_approvals:
            return {
                "status": "requires_approval",
                "reason": "Shared upgrades need approval from two creators before BlueMesh can pull changes.",
            }
        return {"status": "ready", "commands": [["git", "fetch", "origin"], ["git", "pull", "--ff-only"]]}

    def plan_pull(
        self,
        *,
        approved: bool,
        approvals: dict[str, bool] | None = None,
        required_approvals: int = 2,
    ) -> dict[str, Any]:
        return self._shared_upgrade_plan(
            approved=approved,
            approvals=approvals,
            required_approvals=required_approvals,
        )

    def pull_approved_updates(
        self,
        *,
        repo_path: str | Path,
        approved: bool,
        approvals: dict[str, bool] | None = None,
        required_approvals: int = 2,
    ) -> str:
        plan = self._shared_upgrade_plan(
            approved=approved,
            approvals=approvals,
            required_approvals=required_approvals,
        )
        if plan["status"] != "ready":
            raise PermissionError(plan["reason"])
        before = self.local_head(repo_path)
        output = self._git(repo_path, ["pull", "--ff-only"], timeout_seconds=60)
        after = self.local_head(repo_path)
        self.ledger.append_change(
            node_id=None,
            creator_id=None,
            change_type="github_pull_approved",
            affected_module="BlueUpdateManager",
            record_key="main",
            before_state={"head": before},
            after_state={"head": after, "output": output},
            approval_status="approved",
        )
        return output

    def plan_rollback(self, *, stable_revision: str, approved: bool) -> dict[str, Any]:
        if not approved:
            return {"status": "requires_approval", "reason": "Rollback changes code state and requires creator approval."}
        if not SAFE_GIT_REF.match(stable_revision):
            raise ValueError("Stable revision must be a safe commit hash, tag, or ref name.")
        return {"status": "ready", "commands": [["git", "reset", "--hard", stable_revision]]}

    def rollback_to_revision(
        self,
        *,
        repo_path: str | Path,
        stable_revision: str,
        approved: bool,
        dry_run: bool = True,
    ) -> dict[str, Any]:
        plan = self.plan_rollback(stable_revision=stable_revision, approved=approved)
        if plan["status"] != "ready":
            return plan
        before = self.local_head(repo_path)
        target = self._git(repo_path, ["rev-parse", "--verify", f"{stable_revision}^{{commit}}"], timeout_seconds=15)
        if dry_run:
            result = {"status": "planned", "before_head": before, "target_head": target, "dry_run": True}
        else:
            output = self._git(repo_path, ["reset", "--hard", target], timeout_seconds=60)
            result = {"status": "rolled_back", "before_head": before, "target_head": target, "output": output}
        self.ledger.append_change(
            node_id=None,
            creator_id=None,
            change_type="github_rollback_planned" if dry_run else "github_rollback_performed",
            affected_module="BlueUpdateManager",
            record_key=stable_revision,
            before_state={"head": before},
            after_state=result,
            approval_status="approved",
        )
        return result
