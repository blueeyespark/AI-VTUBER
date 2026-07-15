from __future__ import annotations
from blue_workspace.safety import PathPolicy

class FileSearchTool:
    def __init__(self, policy: PathPolicy):
        self.policy = policy

    def find_files(self, query: str, max_results: int = 100) -> list[dict[str, object]]:
        q = query.lower()
        results = []
        for path in self.policy.workspace_root.rglob("*"):
            rel = path.relative_to(self.policy.workspace_root)
            if self.policy.is_excluded(rel):
                continue
            if q in path.name.lower():
                results.append({"path": str(rel).replace("\\", "/"), "type": "folder" if path.is_dir() else "file"})
            if len(results) >= max_results:
                break
        return results
