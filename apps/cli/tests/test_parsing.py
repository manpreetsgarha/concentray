from concentray_cli.models import Assignee, Runtime, TaskExecutionMode, TaskStatus, UpdatedBy
from concentray_cli.parsing import (
    normalize_worker_id,
    parse_assignee,
    parse_execution_mode,
    parse_json_object_option,
    parse_runtime,
    parse_status,
    parse_updated_by,
)


def test_parsing_helpers_normalize_expected_values() -> None:
    assert parse_status("done") == TaskStatus.DONE
    assert parse_execution_mode("session") == TaskExecutionMode.SESSION
    assert parse_assignee("ai") == Assignee.AI
    assert parse_runtime("openclaw") == Runtime.OPENCLAW
    assert parse_updated_by("system") == UpdatedBy.SYSTEM
    assert normalize_worker_id("  codex:session:host:main  ") == "codex:session:host:main"


def test_parse_json_object_option_accepts_object_and_null() -> None:
    assert parse_json_object_option('{"step":"sync"}', option_name="--payload") == {"step": "sync"}
    assert parse_json_object_option("null", option_name="--payload") is None
