from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from concentray_cli.models import (
    Activity,
    Assignee,
    DEFAULT_LEASE_SECONDS,
    Note,
    NoteKind,
    Run,
    RunStatus,
    Runtime,
    Store,
    Task,
    TaskExecutionMode,
    TaskStatus,
    UpdatedBy,
    heartbeat_is_stale,
    iso_now,
    parse_iso,
    validate_worker_id,
)
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
        temp.write_text(store.model_dump_json(indent=2))
        temp.replace(self.store_path)

    def _task_lookup(self, store: Store) -> Dict[str, Task]:
        return {task.id: task for task in store.tasks}

    def _run_lookup(self, store: Store) -> Dict[str, Run]:
        return {run.id: run for run in store.runs}

    def _find_task(self, store: Store, task_id: str) -> tuple[int, Task]:
        for index, task in enumerate(store.tasks):
            if task.id == task_id:
                return index, task
        raise ValueError(f"Task '{task_id}' not found")

    def _find_run(self, store: Store, run_id: str) -> tuple[int, Run]:
        for index, run in enumerate(store.runs):
            if run.id == run_id:
                return index, run
        raise ValueError(f"Run '{run_id}' not found")

    def _append_activity(
        self,
        store: Store,
        *,
        task_id: str,
        actor: UpdatedBy,
        kind: str,
        summary: str,
        payload: Optional[Dict[str, Any]] = None,
        runtime: Optional[Runtime] = None,
        run_id: Optional[str] = None,
        created_at: Optional[str] = None,
    ) -> Activity:
        entry = Activity(
            task_id=task_id,
            actor=actor,
            kind=kind,
            summary=summary,
            payload=payload,
            runtime=runtime,
            run_id=run_id,
            created_at=created_at or iso_now(),
        )
        store.activity.append(entry)
        return entry

    def _normalize_store_locked(self, store: Store) -> bool:
        changed = False
        now = iso_now()
        run_lookup = self._run_lookup(store)

        for task_index, task in enumerate(store.tasks):
            if not task.active_run_id:
                continue
            run = run_lookup.get(task.active_run_id)
            if run is None or run.status != RunStatus.ACTIVE:
                if task.active_run_id is not None:
                    store.tasks[task_index] = task.model_copy(
                        update={
                            "active_run_id": None,
                            "updated_at": now,
                            "updated_by": UpdatedBy.SYSTEM,
                        }
                    )
                    changed = True
                continue

            if heartbeat_is_stale(run.last_heartbeat_at, now=parse_iso(now), lease_seconds=run.lease_seconds):
                run_index, _ = self._find_run(store, run.id)
                store.runs[run_index] = run.model_copy(
                    update={
                        "status": RunStatus.EXPIRED,
                        "ended_at": now,
                        "end_reason": "lease_expired",
                    }
                )
                store.tasks[task_index] = task.model_copy(
                    update={
                        "active_run_id": None,
                        "updated_at": now,
                        "updated_by": UpdatedBy.SYSTEM,
                    }
                )
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=UpdatedBy.SYSTEM,
                    runtime=run.runtime,
                    run_id=run.id,
                    kind="run_expired",
                    summary=f"Worker {run.worker_id} stopped heartbeating and the run expired.",
                    payload={"worker_id": run.worker_id, "runtime": run.runtime, "lease_seconds": run.lease_seconds},
                    created_at=now,
                )
                changed = True

        return changed

    def _load_locked(self) -> Store:
        store = self._load()
        if self._normalize_store_locked(store):
            self._save(store)
        return store

    def _eligible_task(
        self,
        task: Task,
        *,
        runtime: Runtime,
        statuses: set[str],
        execution_modes: Optional[set[str]],
    ) -> bool:
        if task.assignee != Assignee.AI:
            return False
        task_status = task.status.value if isinstance(task.status, TaskStatus) else str(task.status)
        if task_status not in statuses:
            return False
        task_mode = task.execution_mode.value if isinstance(task.execution_mode, TaskExecutionMode) else str(task.execution_mode)
        if execution_modes and task_mode not in execution_modes:
            return False
        if task.target_runtime is None:
            return True
        task_runtime = task.target_runtime.value if isinstance(task.target_runtime, Runtime) else str(task.target_runtime)
        return task_runtime == runtime.value

    def _task_sort_key(self, task: Task, runtime: Runtime) -> tuple[int, int, str, str]:
        targeted_rank = 0 if task.target_runtime == runtime else 1
        urgency_rank = -(task.ai_urgency or 0)
        return (
            targeted_rank,
            urgency_rank,
            task.created_at,
            task.id,
        )

    def _current_run(self, store: Store, task: Task) -> Optional[Run]:
        if not task.active_run_id:
            return None
        for run in store.runs:
            if run.id == task.active_run_id and run.status == RunStatus.ACTIVE:
                return run
        return None

    def _assert_worker_claim(
        self,
        store: Store,
        task: Task,
        *,
        runtime: Optional[Runtime],
        worker_id: Optional[str],
    ) -> Optional[Run]:
        run = self._current_run(store, task)
        if run is None:
            return None
        if runtime is None or worker_id is None:
            raise ValueError(f"Task '{task.id}' is leased by {run.worker_id}; runtime and worker_id are required")
        worker = validate_worker_id(runtime, worker_id)
        if run.runtime != runtime or run.worker_id != worker:
            raise ValueError(f"Task '{task.id}' is leased by {run.worker_id}")
        return run

    def list_tasks(self) -> List[Task]:
        with self._store_lock():
            store = self._load_locked()
            return list(store.tasks)

    def get_next_task(
        self,
        runtime: Runtime,
        statuses: Iterable[TaskStatus],
        *,
        execution_modes: Optional[Iterable[TaskExecutionMode]] = None,
        worker_id: Optional[str] = None,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> Optional[Task]:
        with self._store_lock():
            store = self._load_locked()
            status_set = {item.value if isinstance(item, TaskStatus) else str(item) for item in statuses}
            mode_set = (
                {item.value if isinstance(item, TaskExecutionMode) else str(item) for item in execution_modes}
                if execution_modes is not None
                else None
            )

            if worker_id:
                worker = validate_worker_id(runtime, worker_id)
                for task in sorted(store.tasks, key=lambda item: self._task_sort_key(item, runtime)):
                    if not self._eligible_task(task, runtime=runtime, statuses=status_set, execution_modes=mode_set):
                        continue
                    run = self._current_run(store, task)
                    if run and run.worker_id == worker and run.runtime == runtime:
                        return task

            for task in sorted(store.tasks, key=lambda item: self._task_sort_key(item, runtime)):
                if not self._eligible_task(task, runtime=runtime, statuses=status_set, execution_modes=mode_set):
                    continue
                if self._current_run(store, task) is not None:
                    continue
                return task

            return None

    def claim_next_task(
        self,
        *,
        runtime: Runtime,
        worker_id: str,
        statuses: Iterable[TaskStatus],
        execution_modes: Optional[Iterable[TaskExecutionMode]] = None,
        updated_by: UpdatedBy,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> tuple[Optional[Task], Optional[Run]]:
        worker = validate_worker_id(runtime, worker_id)
        with self._store_lock():
            store = self._load_locked()
            status_set = {item.value if isinstance(item, TaskStatus) else str(item) for item in statuses}
            mode_set = (
                {item.value if isinstance(item, TaskExecutionMode) else str(item) for item in execution_modes}
                if execution_modes is not None
                else None
            )

            for task in sorted(store.tasks, key=lambda item: self._task_sort_key(item, runtime)):
                if not self._eligible_task(task, runtime=runtime, statuses=status_set, execution_modes=mode_set):
                    continue
                run = self._current_run(store, task)
                if run and run.worker_id == worker and run.runtime == runtime:
                    return task, run

            for task_index, task in sorted(
                enumerate(store.tasks),
                key=lambda pair: self._task_sort_key(pair[1], runtime),
            ):
                if not self._eligible_task(task, runtime=runtime, statuses=status_set, execution_modes=mode_set):
                    continue
                if self._current_run(store, task) is not None:
                    continue

                now = iso_now()
                run = Run(
                    task_id=task.id,
                    runtime=runtime,
                    worker_id=worker,
                    status=RunStatus.ACTIVE,
                    started_at=now,
                    last_heartbeat_at=now,
                    lease_seconds=lease_seconds,
                )
                store.runs.append(run)
                updated_task = task.model_copy(
                    update={
                        "status": TaskStatus.IN_PROGRESS,
                        "active_run_id": run.id,
                        "updated_at": now,
                        "updated_by": updated_by,
                    }
                )
                store.tasks[task_index] = updated_task
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=runtime,
                    run_id=run.id,
                    kind="claimed",
                    summary=f"Task claimed by {worker}.",
                    payload={"worker_id": worker, "runtime": runtime.value, "lease_seconds": lease_seconds},
                    created_at=now,
                )
                self._save(store)
                return updated_task, run

            return None, None

    def get_task(self, task_id: str) -> Optional[Task]:
        with self._store_lock():
            store = self._load_locked()
            for task in store.tasks:
                if task.id == task_id:
                    return task
            return None

    def get_active_run(self, task_id: str) -> Optional[Run]:
        with self._store_lock():
            store = self._load_locked()
            task = next((item for item in store.tasks if item.id == task_id), None)
            if task is None:
                return None
            return self._current_run(store, task)

    def list_notes(self, task_id: str) -> List[Note]:
        with self._store_lock():
            store = self._load_locked()
            return sorted([note for note in store.notes if note.task_id == task_id], key=lambda item: item.created_at)

    def list_activity(self, task_id: str) -> List[Activity]:
        with self._store_lock():
            store = self._load_locked()
            return sorted(
                [entry for entry in store.activity if entry.task_id == task_id],
                key=lambda item: item.created_at,
            )

    def create_task(self, payload: Dict[str, Any], *, updated_by: UpdatedBy) -> Task:
        with self._store_lock():
            store = self._load_locked()
            now = iso_now()
            task = Task(
                title=str(payload.get("title", "")).strip() or "Untitled task",
                status=TaskStatus(payload.get("status", TaskStatus.PENDING.value)),
                assignee=Assignee(payload.get("assignee", Assignee.AI.value)),
                target_runtime=Runtime(payload["target_runtime"]) if payload.get("target_runtime") else None,
                execution_mode=TaskExecutionMode(payload.get("execution_mode", TaskExecutionMode.AUTONOMOUS.value)),
                ai_urgency=int(payload.get("ai_urgency", 3)),
                context_link=payload.get("context_link"),
                input_request=payload.get("input_request"),
                input_response=payload.get("input_response"),
                created_at=now,
                updated_at=now,
                updated_by=updated_by,
            )
            store.tasks.append(task)
            self._append_activity(
                store,
                task_id=task.id,
                actor=updated_by,
                kind="task_created",
                summary=f"Task created: {task.title}",
                payload={"assignee": task.assignee, "target_runtime": task.target_runtime, "execution_mode": task.execution_mode},
                created_at=now,
            )
            self._save(store)
            return task

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
        with self._store_lock():
            store = self._load_locked()
            task_index, task = self._find_task(store, task_id)
            if updated_by == UpdatedBy.AI and not allow_override:
                self._assert_worker_claim(store, task, runtime=runtime, worker_id=worker_id)

            now = iso_now()
            updates: Dict[str, Any] = {}
            if "title" in patch and patch["title"] is not None:
                updates["title"] = str(patch["title"]).strip()
            if "status" in patch and patch["status"] is not None:
                updates["status"] = TaskStatus(str(patch["status"]))
            if "assignee" in patch and patch["assignee"] is not None:
                updates["assignee"] = Assignee(str(patch["assignee"]))
            if "target_runtime" in patch:
                updates["target_runtime"] = Runtime(str(patch["target_runtime"])) if patch["target_runtime"] else None
            if "execution_mode" in patch and patch["execution_mode"] is not None:
                updates["execution_mode"] = TaskExecutionMode(str(patch["execution_mode"]))
            if "ai_urgency" in patch and patch["ai_urgency"] is not None:
                updates["ai_urgency"] = int(patch["ai_urgency"])
            if "context_link" in patch:
                updates["context_link"] = str(patch["context_link"]).strip() or None if patch["context_link"] else None
            if "input_request" in patch:
                updates["input_request"] = patch["input_request"]
            if "input_response" in patch:
                updates["input_response"] = patch["input_response"]
            if patch.get("clear_check_in"):
                updates["check_in_requested_at"] = None
                updates["check_in_requested_by"] = None

            updated_task = task.model_copy(
                update={
                    **updates,
                    "updated_at": now,
                    "updated_by": updated_by,
                }
            )

            active_run = self._current_run(store, task)
            should_end_run = active_run is not None and (
                updated_task.status in {TaskStatus.BLOCKED, TaskStatus.DONE}
                or updated_task.assignee != Assignee.AI
            )
            if should_end_run and active_run is not None:
                run_index, run = self._find_run(store, active_run.id)
                end_reason = "completed" if updated_task.status == TaskStatus.DONE else "blocked"
                if updated_task.assignee != Assignee.AI:
                    end_reason = "reassigned"
                store.runs[run_index] = run.model_copy(
                    update={
                        "status": RunStatus.ENDED,
                        "ended_at": now,
                        "end_reason": end_reason,
                    }
                )
                updated_task = updated_task.model_copy(update={"active_run_id": None})
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=run.runtime,
                    run_id=run.id,
                    kind="run_ended",
                    summary=f"Run ended: {end_reason}.",
                    payload={"worker_id": run.worker_id, "end_reason": end_reason},
                    created_at=now,
                )

            store.tasks[task_index] = updated_task

            if task.status != updated_task.status:
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=runtime,
                    run_id=updated_task.active_run_id,
                    kind="status_changed",
                    summary=f"Status changed from {task.status} to {updated_task.status}.",
                    payload={"from": task.status, "to": updated_task.status},
                    created_at=now,
                )
            if task.assignee != updated_task.assignee or task.target_runtime != updated_task.target_runtime:
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=runtime,
                    run_id=updated_task.active_run_id,
                    kind="routing_changed",
                    summary="Task routing updated.",
                    payload={
                        "assignee": updated_task.assignee,
                        "target_runtime": updated_task.target_runtime,
                        "execution_mode": updated_task.execution_mode,
                    },
                    created_at=now,
                )
            if "input_request" in updates:
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=runtime,
                    run_id=updated_task.active_run_id,
                    kind="input_request_updated",
                    summary="Input request updated.",
                    payload={"input_request": updated_task.input_request},
                    created_at=now,
                )
            if "input_response" in updates:
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=runtime,
                    run_id=updated_task.active_run_id,
                    kind="input_response_updated",
                    summary="Input response updated.",
                    payload={"input_response": updated_task.input_response},
                    created_at=now,
                )

            self._save(store)
            return updated_task

    def heartbeat(
        self,
        task_id: str,
        *,
        runtime: Runtime,
        worker_id: str,
    ) -> Run:
        worker = validate_worker_id(runtime, worker_id)
        with self._store_lock():
            store = self._load_locked()
            _, task = self._find_task(store, task_id)
            run = self._assert_worker_claim(store, task, runtime=runtime, worker_id=worker)
            if run is None:
                raise ValueError(f"Task '{task_id}' is not currently claimed")
            run_index, current_run = self._find_run(store, run.id)
            updated_run = current_run.model_copy(update={"last_heartbeat_at": iso_now()})
            store.runs[run_index] = updated_run
            self._save(store)
            return updated_run

    def request_check_in(self, task_id: str, *, requested_by: UpdatedBy) -> Task:
        with self._store_lock():
            store = self._load_locked()
            task_index, task = self._find_task(store, task_id)
            now = iso_now()
            updated_task = task.model_copy(
                update={
                    "check_in_requested_at": now,
                    "check_in_requested_by": requested_by,
                    "updated_at": now,
                    "updated_by": requested_by,
                }
            )
            store.tasks[task_index] = updated_task
            self._append_activity(
                store,
                task_id=task.id,
                actor=requested_by,
                kind="check_in_requested",
                summary="Status check-in requested.",
                payload={"requested_by": requested_by},
                created_at=now,
            )
            self._save(store)
            return updated_task

    def add_note(
        self,
        task_id: str,
        *,
        author: UpdatedBy,
        content: str,
        kind: str = "note",
        attachment: Optional[Dict[str, Any]] = None,
    ) -> Note:
        with self._store_lock():
            store = self._load_locked()
            self._find_task(store, task_id)
            note = Note(
                task_id=task_id,
                author=author,
                kind=NoteKind(kind),
                content=content,
                attachment=attachment,
            )
            store.notes.append(note)
            self._append_activity(
                store,
                task_id=task_id,
                actor=author,
                kind="note_added",
                summary="A note was added.",
                payload={"note_id": note.id, "kind": note.kind},
                created_at=note.created_at,
            )
            self._save(store)
            return note

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
        with self._store_lock():
            store = self._load_locked()
            task_index, task = self._find_task(store, task_id)
            run = None
            if actor == UpdatedBy.AI:
                run = self._assert_worker_claim(store, task, runtime=runtime, worker_id=worker_id)

            created_at = iso_now()
            entry = self._append_activity(
                store,
                task_id=task_id,
                actor=actor,
                kind=kind,
                summary=summary,
                payload=payload,
                runtime=runtime,
                run_id=run.id if run else task.active_run_id,
                created_at=created_at,
            )
            if clear_check_in and (task.check_in_requested_at or task.check_in_requested_by):
                store.tasks[task_index] = task.model_copy(
                    update={
                        "check_in_requested_at": None,
                        "check_in_requested_by": None,
                        "updated_at": created_at,
                        "updated_by": actor,
                    }
                )
            self._save(store)
            return entry

    def delete_task(self, task_id: str, *, updated_by: UpdatedBy) -> bool:
        with self._store_lock():
            store = self._load_locked()
            task_ids = {task.id for task in store.tasks}
            if task_id not in task_ids:
                return False
            store.tasks = [task for task in store.tasks if task.id != task_id]
            store.notes = [note for note in store.notes if note.task_id != task_id]
            store.runs = [run for run in store.runs if run.task_id != task_id]
            store.activity = [entry for entry in store.activity if entry.task_id != task_id]
            self._save(store)
            return True
