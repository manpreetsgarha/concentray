from __future__ import annotations

from typing import Any, Dict, List

from concentray_cli.models import Activity, Note, Run, Task, iso_now


def build_context_envelope(task: Task, active_run: Run | None, notes: List[Note], activity: List[Activity]) -> Dict[str, Any]:
    assignee = task.assignee.value if hasattr(task.assignee, "value") else str(task.assignee)
    execution_mode = task.execution_mode.value if hasattr(task.execution_mode, "value") else str(task.execution_mode)
    status = task.status.value if hasattr(task.status, "value") else str(task.status)
    target_runtime = task.target_runtime.value if hasattr(task.target_runtime, "value") else task.target_runtime

    return {
        "schema_version": "2.0",
        "task": task.model_dump(),
        "active_run": active_run.model_dump() if active_run else None,
        "context": {
            "context_link": task.context_link,
            "title": task.title,
            "assignee": assignee,
            "target_runtime": target_runtime,
            "execution_mode": execution_mode,
        },
        "input_request": task.input_request,
        "input_response": task.input_response,
        "notes": [note.model_dump() for note in notes],
        "activity": [entry.model_dump() for entry in activity],
        "pending_check_in": (
            {
                "requested_at": task.check_in_requested_at,
                "requested_by": task.check_in_requested_by,
            }
            if task.check_in_requested_at
            else None
        ),
        "artifacts": [
            {
                "attachment": note.attachment,
                "note_id": note.id,
            }
            for note in notes
            if note.attachment
        ],
        "constraints": {
            "status": status,
            "ai_urgency": task.ai_urgency,
            "execution_mode": execution_mode,
            "target_runtime": target_runtime,
        },
        "timestamps": {
            "task_updated_at": task.updated_at,
            "generated_at": iso_now(),
        },
    }
