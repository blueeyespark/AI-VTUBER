from __future__ import annotations
from pathlib import Path

DEFAULT_EXCLUDED_NAMES = {
    ".git", ".hg", ".svn", ".env", ".venv", "venv", "env", "node_modules",
    "__pycache__", ".pytest_cache", ".mypy_cache", "dist", "build", "out",
    "coverage", ".next", ".cache", "ui_failed_backup",
}
DEFAULT_EXCLUDED_SUFFIXES = {
    ".zip", ".rar", ".7z", ".exe", ".dll", ".bin", ".db", ".sqlite", ".pyc",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".blend", ".vrm",
}

class PathPolicy:
    def __init__(self, workspace_root: str | Path):
        self.workspace_root = Path(workspace_root).resolve()

    def resolve_inside(self, path: str | Path = ".") -> Path:
        candidate = (self.workspace_root / path).resolve() if not Path(path).is_absolute() else Path(path).resolve()
        try:
            candidate.relative_to(self.workspace_root)
        except ValueError as exc:
            raise PermissionError(f"Path is outside the approved workspace: {candidate}") from exc
        return candidate

    def is_excluded(self, path: str | Path) -> bool:
        p = Path(path)
        parts = {part.lower() for part in p.parts}
        if parts.intersection(DEFAULT_EXCLUDED_NAMES):
            return True
        return p.suffix.lower() in DEFAULT_EXCLUDED_SUFFIXES

    def is_probably_text(self, path: str | Path) -> bool:
        p = Path(path)
        return not self.is_excluded(p) and p.suffix.lower() not in DEFAULT_EXCLUDED_SUFFIXES
