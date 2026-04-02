from concentray_cli.models import Actor, CommentType, TaskExecutionMode, TaskStatus, UpdatedBy
from concentray_cli.parsing import (
    normalize_worker_id,
    parse_actor,
    parse_comment_type,
    parse_execution_mode,
    parse_json_object_option,
    parse_status,
    parse_updated_by,
)


def test_parsing_helpers_normalize_expected_values() -> None:
    assert parse_status("done") == TaskStatus.DONE
    assert parse_execution_mode("session") == TaskExecutionMode.SESSION
    assert parse_actor("ai") == Actor.AI
    assert parse_updated_by("system") == UpdatedBy.SYSTEM
    assert parse_comment_type("log") == CommentType.LOG
    assert normalize_worker_id("  codex-main  ") == "codex-main"


def test_parse_json_object_option_accepts_object_and_null() -> None:
    assert parse_json_object_option('{"step":"sync"}', option_name="--metadata") == {"step": "sync"}
    assert parse_json_object_option("null", option_name="--metadata") is None
