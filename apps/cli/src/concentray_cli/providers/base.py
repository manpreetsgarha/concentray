from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Iterable, List, Optional

from concentray_cli.models import Activity, Note, Run, Runtime, Task, TaskExecutionMode, TaskStatus, UpdatedBy


class Provider(ABC):
    @abstractmethod
    def list_tasks(self) -> List[Task]:
        raise NotImplementedError

    @abstractmethod
    def get_next_task(
        self,
        runtime: Runtime,
        statuses: Iterable[TaskStatus],
        *,
        execution_modes: Optional[Iterable[TaskExecutionMode]] = None,
        worker_id: Optional[str] = None,
        lease_seconds: int = 600,
    ) -> Optional[Task]:
        raise NotImplementedError

    @abstractmethod
    def claim_next_task(
        self,
        *,
        runtime: Runtime,
        worker_id: str,
        statuses: Iterable[TaskStatus],
        execution_modes: Optional[Iterable[TaskExecutionMode]] = None,
        updated_by: UpdatedBy,
        lease_seconds: int = 600,
    ) -> tuple[Optional[Task], Optional[Run]]:
        raise NotImplementedError

    @abstractmethod
    def get_task(self, task_id: str) -> Optional[Task]:
        raise NotImplementedError

    @abstractmethod
    def get_active_run(self, task_id: str) -> Optional[Run]:
        raise NotImplementedError

    @abstractmethod
    def list_notes(self, task_id: str) -> List[Note]:
        raise NotImplementedError

    @abstractmethod
    def list_activity(self, task_id: str) -> List[Activity]:
        raise NotImplementedError

    @abstractmethod
    def create_task(self, payload: Dict[str, Any], *, updated_by: UpdatedBy) -> Task:
        raise NotImplementedError

    @abstractmethod
    def update_task(
        self,
        task_id: str,
        patch: Dict[str, Any],
        *,
        updated_by: UpdatedBy,
        runtime: Optional[Runtime] = None,
        worker_id: Optional[str] = None,
        allow_override: bool = False,
    ) -> Task:
        raise NotImplementedError

    @abstractmethod
    def heartbeat(
        self,
        task_id: str,
        *,
        runtime: Runtime,
        worker_id: str,
    ) -> Run:
        raise NotImplementedError

    @abstractmethod
    def request_check_in(self, task_id: str, *, requested_by: UpdatedBy) -> Task:
        raise NotImplementedError

    @abstractmethod
    def add_note(
        self,
        task_id: str,
        *,
        author: UpdatedBy,
        content: str,
        kind: str = "note",
        attachment: Optional[Dict[str, Any]] = None,
    ) -> Note:
        raise NotImplementedError

    @abstractmethod
    def add_activity(
        self,
        task_id: str,
        *,
        actor: UpdatedBy,
        kind: str,
        summary: str,
        payload: Optional[Dict[str, Any]] = None,
        runtime: Optional[Runtime] = None,
        worker_id: Optional[str] = None,
        clear_check_in: bool = False,
    ) -> Activity:
        raise NotImplementedError

    @abstractmethod
    def delete_task(self, task_id: str, *, updated_by: UpdatedBy) -> bool:
        raise NotImplementedError
