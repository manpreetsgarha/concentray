from __future__ import annotations

import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

from concentray_cli.models import (
    Activity,
    Assignee,
    DEFAULT_LEASE_SECONDS,
    LOCAL_STORE_SCHEMA_VERSION,
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
    normalize_attachment_metadata,
    normalize_input_request,
    normalize_input_response,
    parse_iso,
    summarize_input_response,
    validate_worker_id,
)
from concentray_cli.providers.base import Provider

try:
    import fcntl
except ModuleNotFoundError:  # pragma: no cover
    fcntl = None


LEGACY_STATUS_MAP = {
    "pending": TaskStatus.PENDING,
    "in_progress": TaskStatus.IN_PROGRESS,
    "blocked": TaskStatus.BLOCKED,
    "done": TaskStatus.DONE,
}
LEGACY_ASSIGNEE_MAP = {
    "ai": Assignee.AI,
    "human": Assignee.HUMAN,
}
LEGACY_UPDATED_BY_MAP = {
    "ai": UpdatedBy.AI,
    "human": UpdatedBy.HUMAN,
    "system": UpdatedBy.SYSTEM,
}


def _legacy_token(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "_")


def _legacy_string(payload: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        normalized = str(value).strip()
        if normalized:
            return normalized
    return None


def _legacy_enum_value(
    payload: Dict[str, Any],
    *,
    keys: tuple[str, ...],
    mapping: Dict[str, Any],
    default: Any,
) -> Any:
    for key in keys:
        if key not in payload or payload.get(key) is None:
            continue
        token = _legacy_token(payload.get(key))
        if token in mapping:
            return mapping[token]
        break
    return default


def _legacy_runtime_from_worker_id(worker_id: Optional[str]) -> Optional[Runtime]:
    value = str(worker_id or "").strip().lower()
    if not value:
        return None
    prefix = value.split(":", 1)[0]
    try:
        return Runtime(prefix)
    except ValueError:
        return None


def _legacy_comment_attachment(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw_attachment = payload.get("Attachment")
    if raw_attachment is None:
        raw_attachment = payload.get("attachment")
    if raw_attachment is None:
        return None
    if not isinstance(raw_attachment, dict):
        return None
    return normalize_attachment_metadata(raw_attachment, field="attachment")


def _migrate_legacy_task(payload: Dict[str, Any], runs: List[Run]) -> Optional[Task]:
    deleted_at = _legacy_string(payload, "Deleted_At", "deleted_at")
    if deleted_at:
        return None

    task_id = _legacy_string(payload, "Task_ID", "id") or str(uuid4())
    created_at = _legacy_string(payload, "Created_At", "created_at") or iso_now()
    updated_at = _legacy_string(payload, "Updated_At", "updated_at") or created_at
    input_request = normalize_input_request(payload.get("Input_Request"), created_at=created_at)
    raw_input_response = payload.get("Input_Response")
    input_response = (
        normalize_input_response(input_request, raw_input_response)
        if input_request is not None and raw_input_response is not None
        else None
    )
    assignee = _legacy_enum_value(
        payload,
        keys=("Assignee", "assignee"),
        mapping=LEGACY_ASSIGNEE_MAP,
        default=Assignee.AI,
    )
    status = _legacy_enum_value(
        payload,
        keys=("Status", "status"),
        mapping=LEGACY_STATUS_MAP,
        default=TaskStatus.PENDING,
    )
    updated_by = _legacy_enum_value(
        payload,
        keys=("Updated_By", "updated_by", "Created_By", "created_by"),
        mapping=LEGACY_UPDATED_BY_MAP,
        default=UpdatedBy.HUMAN,
    )
    execution_mode = TaskExecutionMode.SESSION if assignee == Assignee.HUMAN and input_request is None else TaskExecutionMode.AUTONOMOUS

    active_run_id: Optional[str] = None
    worker_id = _legacy_string(payload, "Worker_ID", "worker_id")
    claimed_at = _legacy_string(payload, "Claimed_At", "claimed_at")
    runtime = _legacy_runtime_from_worker_id(worker_id)
    if (
        worker_id is not None
        and claimed_at is not None
        and runtime is not None
        and assignee == Assignee.AI
        and status in {TaskStatus.PENDING, TaskStatus.IN_PROGRESS}
    ):
        run = Run(
            task_id=task_id,
            runtime=runtime,
            worker_id=worker_id.lower(),
            status=RunStatus.ACTIVE,
            started_at=claimed_at,
            last_heartbeat_at=updated_at,
            lease_seconds=DEFAULT_LEASE_SECONDS,
        )
        runs.append(run)
        active_run_id = run.id

    return Task(
        id=task_id,
        title=_legacy_string(payload, "Title", "title") or f"Migrated task {task_id}",
        status=status,
        assignee=assignee,
        target_runtime=_legacy_runtime_from_worker_id(_legacy_string(payload, "Target_Runtime", "target_runtime")),
        execution_mode=execution_mode,
        ai_urgency=int(payload.get("AI_Urgency", payload.get("ai_urgency", 3)) or 3),
        context_link=_legacy_string(payload, "Context_Link", "context_link"),
        input_request=input_request,
        input_response=input_response,
        active_run_id=active_run_id,
        check_in_requested_at=_legacy_string(payload, "Check_In_Requested_At", "check_in_requested_at"),
        check_in_requested_by=_legacy_enum_value(
            payload,
            keys=("Check_In_Requested_By", "check_in_requested_by"),
            mapping=LEGACY_UPDATED_BY_MAP,
            default=None,
        ),
        created_at=created_at,
        updated_at=updated_at,
        updated_by=updated_by,
    )


def _migrate_legacy_comment(payload: Dict[str, Any]) -> Optional[Note]:
    deleted_at = _legacy_string(payload, "Deleted_At", "deleted_at")
    if deleted_at:
        return None

    task_id = _legacy_string(payload, "Task_ID", "task_id")
    if task_id is None:
        return None

    attachment = _legacy_comment_attachment(payload)
    return Note(
        id=_legacy_string(payload, "Comment_ID", "comment_id", "id") or str(uuid4()),
        task_id=task_id,
        author=_legacy_enum_value(
            payload,
            keys=("Author", "author", "Updated_By", "updated_by", "Created_By", "created_by"),
            mapping=LEGACY_UPDATED_BY_MAP,
            default=UpdatedBy.HUMAN,
        ),
        kind=NoteKind.ATTACHMENT if attachment is not None else NoteKind.NOTE,
        content=_legacy_string(payload, "Content", "content", "Body", "body", "Comment", "comment", "Text", "text", "Message", "message") or "",
        attachment=attachment,
        created_at=_legacy_string(payload, "Created_At", "created_at", "Updated_At", "updated_at") or iso_now(),
    )


def _is_legacy_store_payload(payload: Dict[str, Any]) -> bool:
    if "comments" in payload:
        return True
    tasks = payload.get("tasks")
    if not isinstance(tasks, list):
        return False
    return any(
        isinstance(task, dict)
        and any(
            key in task
            for key in (
                "Task_ID",
                "Title",
                "Created_By",
                "Input_Request_Version",
                "Field_Clock",
                "Deleted_At",
                "Worker_ID",
                "Claimed_At",
            )
        )
        for task in tasks
    )


def _migrate_legacy_store(payload: Dict[str, Any]) -> Store:
    raw_tasks = payload.get("tasks")
    raw_comments = payload.get("comments")
    if not isinstance(raw_tasks, list) or not isinstance(raw_comments, list):
        raise ValueError(
            f"Unsupported local store schema. Expected {LOCAL_STORE_SCHEMA_VERSION}, "
            "reinitialize the workspace with `concentray init`."
        )

    runs: List[Run] = []
    tasks = [task for item in raw_tasks if isinstance(item, dict) if (task := _migrate_legacy_task(item, runs)) is not None]
    task_ids = {task.id for task in tasks}
    notes = [
        note
        for item in raw_comments
        if isinstance(item, dict)
        if (note := _migrate_legacy_comment(item)) is not None and note.task_id in task_ids
    ]
    return Store(tasks=tasks, notes=notes, runs=runs, activity=[])


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

    def _load(self) -> tuple[Store, bool]:
        raw_payload = self.store_path.read_text()
        if not raw_payload.strip():
            raise ValueError(
                f"Unsupported local store schema. Expected {LOCAL_STORE_SCHEMA_VERSION}, "
                "reinitialize the workspace with `concentray init`."
            )
        payload = json.loads(raw_payload)
        if not isinstance(payload, dict):
            raise ValueError(
                f"Unsupported local store schema. Expected {LOCAL_STORE_SCHEMA_VERSION}, "
                "reinitialize the workspace with `concentray init`."
            )
        schema_version = payload.get("schema_version")
        if schema_version is None and _is_legacy_store_payload(payload):
            return _migrate_legacy_store(payload), True
        if schema_version != LOCAL_STORE_SCHEMA_VERSION:
            raise ValueError(
                f"Unsupported local store schema. Expected {LOCAL_STORE_SCHEMA_VERSION}, "
                "reinitialize the workspace with `concentray init`."
            )
        return Store.model_validate(payload), False

    def _save(self, store: Store) -> None:
        fd, temp_name = tempfile.mkstemp(
            prefix=f"{self.store_path.name}.",
            suffix=".tmp",
            dir=self.store_path.parent,
            text=True,
        )
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(store.model_dump_json(indent=2))
            temp_path.replace(self.store_path)
        finally:
            if temp_path.exists():
                temp_path.unlink()

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
        store, migrated = self._load()
        if migrated or self._normalize_store_locked(store):
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

    def _assert_blocker_state(self, task: Task) -> None:
        if task.input_request is None:
            return
        if task.status != TaskStatus.BLOCKED or task.assignee != Assignee.HUMAN:
            raise ValueError("input_request requires status='blocked' and assignee='human'")

    def _updated_task(self, task: Task, updates: Dict[str, Any]) -> Task:
        return Task.model_validate({**task.model_dump(), **updates})

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
            input_request = normalize_input_request(payload.get("input_request"), created_at=now)
            input_response = (
                normalize_input_response(input_request, payload.get("input_response"))
                if payload.get("input_response") is not None
                else None
            )
            status = TaskStatus(payload.get("status", TaskStatus.PENDING.value))
            assignee = Assignee(payload.get("assignee", Assignee.AI.value))
            execution_mode = (
                TaskExecutionMode(payload["execution_mode"])
                if payload.get("execution_mode") is not None
                else (
                    TaskExecutionMode.SESSION
                    if assignee == Assignee.HUMAN and input_request is None
                    else TaskExecutionMode.AUTONOMOUS
                )
            )
            task = Task(
                title=str(payload.get("title", "")),
                status=status,
                assignee=assignee,
                target_runtime=Runtime(payload["target_runtime"]) if payload.get("target_runtime") else None,
                execution_mode=execution_mode,
                ai_urgency=int(payload.get("ai_urgency", 3)),
                context_link=payload.get("context_link"),
                input_request=input_request,
                input_response=input_response,
                created_at=now,
                updated_at=now,
                updated_by=updated_by,
            )
            self._assert_blocker_state(task)
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
                normalized_input_request = normalize_input_request(patch["input_request"], created_at=now)
                updates["input_request"] = normalized_input_request
                if normalized_input_request is not None:
                    updates["input_response"] = None
            if "input_response" in patch:
                active_request = updates.get("input_request", task.input_request)
                updates["input_response"] = normalize_input_response(active_request, patch["input_response"])
            if patch.get("clear_check_in"):
                updates["check_in_requested_at"] = None
                updates["check_in_requested_by"] = None

            next_assignee = updates.get("assignee", task.assignee)
            next_input_request = updates.get("input_request", task.input_request)
            if next_assignee == Assignee.HUMAN and next_input_request is None:
                if "target_runtime" not in updates:
                    updates["target_runtime"] = None
                if "execution_mode" not in updates:
                    updates["execution_mode"] = TaskExecutionMode.SESSION
            elif next_assignee == Assignee.AI and "execution_mode" not in updates:
                updates["execution_mode"] = None

            updated_task = self._updated_task(
                task,
                {
                    **updates,
                    "updated_at": now,
                    "updated_by": updated_by,
                },
            )
            self._assert_blocker_state(updated_task)

            active_run = self._current_run(store, task)
            activity_runtime = active_run.runtime if active_run is not None else runtime
            activity_run_id = active_run.id if active_run is not None else updated_task.active_run_id
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
                    runtime=activity_runtime,
                    run_id=activity_run_id,
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
                    runtime=activity_runtime,
                    run_id=activity_run_id,
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
                    runtime=activity_runtime,
                    run_id=activity_run_id,
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
                    runtime=activity_runtime,
                    run_id=activity_run_id,
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

    def respond_to_input_request(
        self,
        task_id: str,
        *,
        updated_by: UpdatedBy,
        response: Dict[str, Any],
    ) -> Task:
        with self._store_lock():
            store = self._load_locked()
            task_index, task = self._find_task(store, task_id)
            normalized_response = normalize_input_response(task.input_request, response)
            now = iso_now()
            active_run = self._current_run(store, task)

            updated_task = self._updated_task(
                task,
                {
                    "input_request": None,
                    "input_response": normalized_response,
                    "status": TaskStatus.PENDING,
                    "assignee": Assignee.AI,
                    "execution_mode": None,
                    "active_run_id": None,
                    "check_in_requested_at": None,
                    "check_in_requested_by": None,
                    "updated_at": now,
                    "updated_by": updated_by,
                },
            )
            store.tasks[task_index] = updated_task

            if active_run is not None:
                run_index, run = self._find_run(store, active_run.id)
                store.runs[run_index] = run.model_copy(
                    update={
                        "status": RunStatus.ENDED,
                        "ended_at": now,
                        "end_reason": "input_responded",
                    }
                )
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=run.runtime,
                    run_id=run.id,
                    kind="run_ended",
                    summary="Run ended: input_responded.",
                    payload={"worker_id": run.worker_id, "end_reason": "input_responded"},
                    created_at=now,
                )

            if task.status != updated_task.status:
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=active_run.runtime if active_run else None,
                    run_id=active_run.id if active_run else None,
                    kind="status_changed",
                    summary=f"Status changed from {task.status} to {updated_task.status}.",
                    payload={"from": task.status, "to": updated_task.status},
                    created_at=now,
                )
            if task.assignee != updated_task.assignee:
                self._append_activity(
                    store,
                    task_id=task.id,
                    actor=updated_by,
                    runtime=active_run.runtime if active_run else None,
                    run_id=active_run.id if active_run else None,
                    kind="routing_changed",
                    summary="Task routing updated.",
                    payload={
                        "assignee": updated_task.assignee,
                        "target_runtime": updated_task.target_runtime,
                        "execution_mode": updated_task.execution_mode,
                    },
                    created_at=now,
                )
            self._append_activity(
                store,
                task_id=task.id,
                actor=updated_by,
                runtime=active_run.runtime if active_run else None,
                run_id=active_run.id if active_run else None,
                kind="input_responded",
                summary=summarize_input_response(normalized_response),
                payload={"input_response": normalized_response},
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
            normalized_attachment = normalize_attachment_metadata(
                attachment,
                field="attachment",
                require_filename=kind == NoteKind.ATTACHMENT.value,
            )
            note = Note(
                task_id=task_id,
                author=author,
                kind=NoteKind(kind),
                content=content,
                attachment=normalized_attachment,
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
