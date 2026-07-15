from __future__ import annotations

READ_ONLY_PREFIXES = (
    ("git", "status"), ("git", "diff"), ("git", "log"), ("git", "branch"),
    ("npm", "test"), ("npm", "run"), ("python", "-m"), ("node", "--check"),
)
BLOCKED_TOKENS = {"reset", "--hard", "clean", "rm", "del", "remove-item", "format", "force-push"}

class CommandPolicy:
    def classify(self, command: list[str]) -> str:
        if not command:
            return "blocked"
        lowered_all = [token.lower() for token in command]
        if any(token in BLOCKED_TOKENS for token in lowered_all):
            return "requires_explicit_approval"
        lowered = tuple(lowered_all[:2])
        for prefix in READ_ONLY_PREFIXES:
            if lowered[:len(prefix)] == prefix:
                return "read_only_or_verification"
        return "requires_approval"
