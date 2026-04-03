import pytest

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


@pytest.mark.parametrize(
    ("fn", "value", "message"),
    [
        (parse_status, "bad", "Invalid --status"),
        (parse_runtime, "robot", "runtime must be one of"),
        (parse_execution_mode, "session,autonomous", "Execution mode must be one of"),
    ],
)
def test_parsing_helpers_reject_invalid_values(fn, value: str, message: str) -> None:
    with pytest.raises(Exception, match=message):
        fn(value)


def test_parse_json_object_option_rejects_bad_json_and_non_object() -> None:
    with pytest.raises(Exception, match="Invalid --payload JSON"):
        parse_json_object_option("{bad", option_name="--payload")

    with pytest.raises(Exception, match="--payload must be a JSON object or null"):
        parse_json_object_option('["bad"]', option_name="--payload")
