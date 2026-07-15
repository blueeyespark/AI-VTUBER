from __future__ import annotations
from pathlib import Path
from blue_workspace.safety import PathPolicy

class DirectoryTreeTool:
    def __init__(self, policy: PathPolicy):
        self.policy = policy

    def tree(self, start: str = ".", max_depth: int = 3, max_entries: int = 200) -> list[dict[str, object]]:
        root = self.policy.resolve_inside(start)
        entries: list[dict[str, object]] = []
        def walk(path: Path, depth: int) -> None:
            if len(entries) >= max_entries or depth > max_depth:
                return
            try:
                children = sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
            except OSError:
                return
            for child in children:
                rel = child.relative_to(self.policy.workspace_root)
                if self.policy.is_excluded(rel):
                    continue
                entries.append({"path": str(rel).replace("\\", "/"), "type": "folder" if child.is_dir() else "file", "depth": depth})
                if child.is_dir():
                    walk(child, depth + 1)
                if len(entries) >= max_entries:
                    break
        if root.is_dir():
            walk(root, 0)
        return entries
