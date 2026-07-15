from __future__ import annotations
from blue_workspace.models import WorkspaceTask

class TaskStateStore:
    def __init__(self):
        self._tasks: dict[str, WorkspaceTask] = {}

    def add(self, task: WorkspaceTask) -> WorkspaceTask:
        self._tasks[task.task_id] = task
        return task

    def list(self) -> list[dict[str, object]]:
        return [task.to_dict() for task in self._tasks.values()]
