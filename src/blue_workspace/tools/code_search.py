from __future__ import annotations
import re
from blue_workspace.safety import PathPolicy, SecretFilter

SYMBOL_PATTERN = re.compile(r"^\s*(?:function|class|def|const|let|var)\s+([A-Za-z_$][\w$]*)|^\s*([A-Za-z_$][\w$]*)\s*[:=]\s*(?:function|\(|async)", re.MULTILINE)

class CodeSearchTool:
    def __init__(self, policy: PathPolicy, secrets: SecretFilter | None = None):
        self.policy = policy
        self.secrets = secrets or SecretFilter()

    def search_text(self, phrase: str, max_results: int = 100) -> list[dict[str, object]]:
        if not phrase:
            return []
        results = []
        needle = phrase.lower()
        for path in self.policy.workspace_root.rglob("*"):
            rel = path.relative_to(self.policy.workspace_root)
            if path.is_dir() or self.policy.is_excluded(rel) or self.secrets.looks_sensitive_path(str(rel)):
                continue
            try:
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for index, line in enumerate(lines, start=1):
                if needle in line.lower():
                    results.append({"path": str(rel).replace("\\", "/"), "line": index, "preview": self.secrets.redact(line.strip()[:240])})
                    if len(results) >= max_results:
                        return results
        return results

    def search_symbols(self, query: str = "", max_results: int = 100) -> list[dict[str, object]]:
        q = query.lower()
        results = []
        for path in self.policy.workspace_root.rglob("*"):
            rel = path.relative_to(self.policy.workspace_root)
            if path.is_dir() or self.policy.is_excluded(rel):
                continue
            if path.suffix.lower() not in {".js", ".cjs", ".mjs", ".py", ".ts", ".tsx", ".jsx"}:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for match in SYMBOL_PATTERN.finditer(text):
                name = match.group(1) or match.group(2)
                if q and q not in name.lower():
                    continue
                line = text.count("\n", 0, match.start()) + 1
                results.append({"symbol": name, "path": str(rel).replace("\\", "/"), "line": line})
                if len(results) >= max_results:
                    return results
        return results
