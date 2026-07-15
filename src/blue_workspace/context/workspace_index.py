from __future__ import annotations
from dataclasses import dataclass, field
from time import time
from blue_workspace.safety import PathPolicy

@dataclass
class WorkspaceIndex:
    root: str
    file_count: int = 0
    folder_count: int = 0
    languages: dict[str, int] = field(default_factory=dict)
    important_files: list[str] = field(default_factory=list)
    indexed_at: float = field(default_factory=time)

    @classmethod
    def build(cls, policy: PathPolicy, max_entries: int = 5000) -> "WorkspaceIndex":
        index = cls(root=str(policy.workspace_root))
        important_names = {"package.json", "README.md", "pyproject.toml", "requirements.txt", ".gitignore", "main.cjs", "index.html"}
        for path in policy.workspace_root.rglob("*"):
            rel = path.relative_to(policy.workspace_root)
            if policy.is_excluded(rel):
                continue
            if path.is_dir():
                index.folder_count += 1
            else:
                index.file_count += 1
                suffix = path.suffix.lower() or "[none]"
                index.languages[suffix] = index.languages.get(suffix, 0) + 1
                if path.name in important_names:
                    index.important_files.append(str(rel).replace("\\", "/"))
            if index.file_count + index.folder_count >= max_entries:
                break
        return index

    def to_dict(self) -> dict[str, object]:
        return {
            "root": self.root,
            "file_count": self.file_count,
            "folder_count": self.folder_count,
            "languages": dict(sorted(self.languages.items(), key=lambda kv: (-kv[1], kv[0]))),
            "important_files": list(self.important_files),
            "indexed_at": self.indexed_at,
        }
