from __future__ import annotations
from blue_workspace.context.workspace_index import WorkspaceIndex
from blue_workspace.safety import PathPolicy
from blue_workspace.tools import GitTools

class WorkspaceContextBuilder:
    def __init__(self, policy: PathPolicy):
        self.policy = policy
        self.git = GitTools(policy)

    def detect_package_managers(self) -> list[str]:
        root = self.policy.workspace_root
        found = []
        if (root / "package.json").exists() or (root / "Project Blue App" / "desktop_pet" / "package.json").exists():
            found.append("npm")
        if (root / "pyproject.toml").exists() or (root / "requirements.txt").exists() or (root / "tests").exists():
            found.append("python-unittest")
        return found

    def build(self, active_file: str = "", selected_lines: int = 0, open_editors: list[str] | None = None) -> dict[str, object]:
        index = WorkspaceIndex.build(self.policy)
        git_status = self.git.status()
        return {
            "workspace_root": str(self.policy.workspace_root),
            "project_name": self.policy.workspace_root.name,
            "repository_root": self.git.repository_root(),
            "active_file": active_file or None,
            "selected_lines": selected_lines,
            "open_editors": open_editors or [],
            "current_git_branch": git_status.get("branch", ""),
            "modified_files": git_status.get("modified_files", 0),
            "detected_languages": index.to_dict()["languages"],
            "package_managers": self.detect_package_managers(),
            "test_commands": ["python -m unittest discover -s tests -v", "npm.cmd test"],
            "build_commands": ["npm.cmd run check"],
            "important_configuration_files": index.important_files,
            "index": index.to_dict(),
        }
