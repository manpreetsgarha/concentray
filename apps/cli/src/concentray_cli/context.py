from __future__ import annotations

from typing import Any, Dict, List

from concentray_cli.models import Comment, Task


def build_context_envelope(task: Task, comments: List[Comment]) -> Dict[str, Any]:
    assignee = task.assignee.value if hasattr(task.assignee, "value") else str(task.assignee)
    created_by = task.created_by.value if hasattr(task.created_by, "value") else str(task.created_by)
    status = task.status.value if hasattr(task.status, "value") else str(task.status)

    return {
        "schema_version": "1.0",
        "task": task.model_dump(by_alias=True),
        "context": {
            "context_link": task.context_link,
            "title": task.title,
            "assignee": assignee,
            "created_by": created_by,
        },
        "input_request": task.input_request,
        "comments": [comment.model_dump(by_alias=True) for comment in comments],
        "artifacts": [
            {
                "attachment_link": c.attachment_link,
                "comment_id": c.comment_id,
            }
            for c in comments
            if c.attachment_link
        ],
        "constraints": {
            "status": status,
            "ai_urgency": task.ai_urgency,
        },
        "timestamps": {
            "task_updated_at": task.updated_at,
            "generated_at": task.updated_at,
        },
    }
