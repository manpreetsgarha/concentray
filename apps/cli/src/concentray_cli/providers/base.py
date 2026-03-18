from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable, List, Optional

from concentray_cli.models import Comment, Task, TaskExecutionMode, TaskStatus, UpdatedBy


class Provider(ABC):
    @abstractmethod
    def list_tasks(self) -> List[Task]:
        raise NotImplementedError

    @abstractmethod
    def get_next_task(
        self,
        assignee: str,
        statuses: Iterable[TaskStatus],
        *,
        execution_modes: Optional[Iterable[TaskExecutionMode]] = None,
        worker_id: Optional[str] = None,
        lease_seconds: int = 1800,
    ) -> Optional[Task]:
        raise NotImplementedError

    @abstractmethod
    def claim_next_task(
        self,
        *,
        worker_id: str,
        assignee: str,
        statuses: Iterable[TaskStatus],
        execution_modes: Optional[Iterable[TaskExecutionMode]] = None,
        updated_by: UpdatedBy,
        lease_seconds: int = 1800,
    ) -> Optional[Task]:
        raise NotImplementedError

    @abstractmethod
    def get_task(self, task_id: str) -> Optional[Task]:
        raise NotImplementedError

    @abstractmethod
    def list_comments(self, task_id: str) -> List[Comment]:
        raise NotImplementedError

    @abstractmethod
    def upsert_task(self, task: Task) -> Task:
        raise NotImplementedError

    @abstractmethod
    def delete_task(self, task_id: str, *, updated_by: UpdatedBy) -> Optional[Task]:
        raise NotImplementedError

    @abstractmethod
    def add_comment(self, comment: Comment) -> Comment:
        raise NotImplementedError
