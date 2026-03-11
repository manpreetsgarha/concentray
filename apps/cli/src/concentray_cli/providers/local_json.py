from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, List, Optional

from concentray_cli.models import Actor, Comment, Store, Task, TaskStatus, UpdatedBy, claim_is_stale, iso_now
from concentray_cli.providers.base import Provider

try:
    import fcntl
except ModuleNotFoundError:  # pragma: no cover
    fcntl = None


class LocalJsonProvider(Provider):
    def __init__(self, store_path: Path):
        self.store_path = store_path
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_path = self.store_path.with_suffix(self.store_path.suffix + ".lock")

        if not self.store_path.exists():
            self._save(Store())

    @contextmanager
    def _store_lock(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("a+", encoding="utf-8") as handle:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl is not None:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def _load(self) -> Store:
        payload = json.loads(self.store_path.read_text() or "{}")
        if not payload:
            return Store()
        return Store.model_validate(payload)

    def _save(self, store: Store) -> None:
        temp = self.store_path.with_suffix(".tmp")
        temp.write_text(store.model_dump_json(indent=2, by_alias=True))
        temp.replace(self.store_path)

    def _matches_assignee_and_status(self, task: Task, assignee: str, status_set: set[str]) -> bool:
        task_assignee = task.assignee.value if isinstance(task.assignee, Actor) else str(task.assignee)
        task_status = task.status.value if isinstance(task.status, TaskStatus) else str(task.status)
        return task_assignee.lower() == assignee.lower() and task_status in status_set

    def _claim_conflicts(self, task: Task, *, worker_id: Optional[str], lease_seconds: int) -> bool:
        if not task.worker_id:
            return False
        if worker_id and task.worker_id == worker_id:
            return False
        return not claim_is_stale(task.claimed_at, lease_seconds=lease_seconds)

    def get_next_task(
        self,
        assignee: str,
        statuses: Iterable[TaskStatus],
        *,
        worker_id: Optional[str] = None,
        lease_seconds: int = 1800,
    ) -> Optional[Task]:
        store = self._load()
        status_set = {s.value if isinstance(s, TaskStatus) else str(s) for s in statuses}

        for task in store.tasks:
            if task.deleted_at:
                continue
            if not self._matches_assignee_and_status(task, assignee, status_set):
                continue
            if self._claim_conflicts(task, worker_id=worker_id, lease_seconds=lease_seconds):
                continue
            return task

        return None

    def claim_next_task(
        self,
        *,
        worker_id: str,
        assignee: str,
        statuses: Iterable[TaskStatus],
        updated_by: UpdatedBy,
        lease_seconds: int = 1800,
    ) -> Optional[Task]:
        claim_worker = worker_id.strip()
        if not claim_worker:
            raise ValueError("worker_id is required")

        status_set = {s.value if isinstance(s, TaskStatus) else str(s) for s in statuses}

        with self._store_lock():
            store = self._load()

            # Prefer tasks already claimed by this worker so one worker resumes its own work.
            for task in store.tasks:
                if task.deleted_at:
                    continue
                if not self._matches_assignee_and_status(task, assignee, status_set):
                    continue
                if task.worker_id == claim_worker and not claim_is_stale(task.claimed_at, lease_seconds=lease_seconds):
                    return task

            for index, task in enumerate(store.tasks):
                if task.deleted_at:
                    continue
                if not self._matches_assignee_and_status(task, assignee, status_set):
                    continue
                if self._claim_conflicts(task, worker_id=claim_worker, lease_seconds=lease_seconds):
                    continue

                now = iso_now()
                next_status = task.status if task.status == TaskStatus.IN_PROGRESS else TaskStatus.IN_PROGRESS
                field_clock = dict(task.field_clock)
                field_clock["worker_id"] = now
                field_clock["claimed_at"] = now
                if next_status != task.status:
                    field_clock["status"] = now

                claimed = task.model_copy(
                    update={
                        "status": next_status,
                        "worker_id": claim_worker,
                        "claimed_at": now,
                        "updated_at": now,
                        "updated_by": updated_by,
                        "version": task.version + 1,
                        "field_clock": field_clock,
                    }
                )
                store.tasks[index] = claimed
                self._save(store)
                return claimed

        return None

    def list_tasks(self) -> List[Task]:
        store = self._load()
        return [task for task in store.tasks if not task.deleted_at]

    def get_task(self, task_id: str) -> Optional[Task]:
        store = self._load()
        for task in store.tasks:
            if task.task_id == task_id and not task.deleted_at:
                return task
        return None

    def list_comments(self, task_id: str) -> List[Comment]:
        store = self._load()
        return [
            c
            for c in store.comments
            if c.task_id == task_id and not c.deleted_at
        ]

    def upsert_task(self, task: Task) -> Task:
        with self._store_lock():
            store = self._load()
            for idx, existing in enumerate(store.tasks):
                if existing.task_id == task.task_id:
                    store.tasks[idx] = task
                    self._save(store)
                    return task

            store.tasks.append(task)
            self._save(store)
            return task

    def add_comment(self, comment: Comment) -> Comment:
        with self._store_lock():
            store = self._load()
            store.comments.append(comment)
            self._save(store)
            return comment
