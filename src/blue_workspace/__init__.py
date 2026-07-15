"""Project Blue workspace-agent package.

Phase 1 is intentionally read-only: it can inspect, index, search, diagnose,
and report workspace state, but it does not write files or run mutating shell
commands. Later phases can add approval-gated editing on top of these services.
"""
from .agent.workspace_agent import BlueWorkspaceAgent

__all__ = ["BlueWorkspaceAgent"]
