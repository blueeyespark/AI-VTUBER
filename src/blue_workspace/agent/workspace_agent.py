from __future__ import annotations
from pathlib import Path
from blue_workspace.agent.executor import WorkspaceExecutor
from blue_workspace.agent.planner import WorkspacePlanner
from blue_workspace.agent.task_state import TaskStateStore
from blue_workspace.agent.verifier import WorkspaceVerifier
from blue_workspace.context import WorkspaceContextBuilder
from blue_workspace.models import AgentMode, TaskStatus, WorkspaceTask
from blue_workspace.safety import PathPolicy
from blue_workspace.tools import CodeSearchTool, DiagnosticsTool, DirectoryTreeTool, FileReaderTool, FileSearchTool, GitTools

class BlueWorkspaceAgent:
    """Central read-only workspace agent for Blue Chat Phase 1."""
    def __init__(self, workspace_root: str | Path):
        self.policy = PathPolicy(workspace_root)
        self.context_builder = WorkspaceContextBuilder(self.policy)
        self.tree_tool = DirectoryTreeTool(self.policy)
        self.file_reader = FileReaderTool(self.policy)
        self.file_search = FileSearchTool(self.policy)
        self.code_search = CodeSearchTool(self.policy)
        self.git = GitTools(self.policy)
        self.diagnostics = DiagnosticsTool()
        self.planner = WorkspacePlanner()
        self.executor = WorkspaceExecutor()
        self.verifier = WorkspaceVerifier()
        self.tasks = TaskStateStore()

    def workspace_context(self, **kwargs) -> dict[str, object]:
        return self.context_builder.build(**kwargs)

    def project_tree(self, start: str = ".", max_depth: int = 3) -> dict[str, object]:
        return {"entries": self.tree_tool.tree(start, max_depth=max_depth)}

    def read_file(self, path: str) -> dict[str, object]:
        return self.file_reader.read_text(path)

    def search_files(self, query: str) -> dict[str, object]:
        return {"query": query, "results": self.file_search.find_files(query)}

    def search_code(self, query: str) -> dict[str, object]:
        return {"query": query, "results": self.code_search.search_text(query)}

    def search_symbols(self, query: str = "") -> dict[str, object]:
        return {"query": query, "results": self.code_search.search_symbols(query)}

    def git_status(self) -> dict[str, object]:
        return self.git.status()

    def create_plan(self, request: str, mode: AgentMode = AgentMode.PLAN) -> dict[str, object]:
        task = WorkspaceTask(title=request[:80] or "Workspace task", request=request, mode=mode)
        task.plan = self.planner.plan(request)
        task.status = TaskStatus.PLANNED
        self.tasks.add(task)
        return task.to_dict()

    def slash_command(self, command: str) -> dict[str, object]:
        parts = command.strip().split(maxsplit=1)
        name = parts[0].lower() if parts else "/help"
        arg = parts[1] if len(parts) > 1 else ""
        if name == "/workspace":
            return {"type": "workspace", "data": self.workspace_context()}
        if name == "/files":
            return {"type": "tree", "data": self.project_tree(arg or ".")}
        if name == "/search":
            return {"type": "search", "data": self.search_code(arg)}
        if name == "/symbols":
            return {"type": "symbols", "data": self.search_symbols(arg)}
        if name == "/git":
            return {"type": "git", "data": self.git_status()}
        if name == "/diagnostics":
            return {"type": "diagnostics", "data": self.diagnostics.current()}
        if name == "/plan":
            return {"type": "plan", "data": self.create_plan(arg)}
        return {"type": "help", "data": {"commands": ["/workspace", "/files", "/search", "/symbols", "/git", "/diagnostics", "/plan"], "phase": self.executor.explain_read_only_phase().to_dict(), "safety": self.verifier.phase_one_checks()}}
