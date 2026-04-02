#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

try:
    from jsonschema import ValidationError, validate as jsonschema_validate
except ModuleNotFoundError:
    class ValidationError(ValueError):
        pass

    def jsonschema_validate(instance: Dict[str, Any], schema: Dict[str, Any]) -> None:
        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                raise ValidationError(f"Missing required key: {key}")

        if schema.get("additionalProperties") is False:
            allowed = set(schema.get("properties", {}).keys())
            extras = [key for key in instance if key not in allowed]
            if extras:
                raise ValidationError(f"Unexpected key(s): {', '.join(extras)}")

        properties = schema.get("properties", {})
        for key, rules in properties.items():
            if key not in instance:
                continue
            value = instance[key]
            enum = rules.get("enum")
            if enum is not None and value not in enum:
                raise ValidationError(f"Invalid enum value for {key}: {value}")

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_ROOT = REPO_ROOT / "packages" / "contracts" / "openclaw-tools" / "v1"
CLI_MODULE = [sys.executable, "-m", "concentray_cli.cli_app"]


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def run_cli(args: List[str]) -> Dict[str, Any]:
    cmd = CLI_MODULE + args
    env = dict(**os.environ)
    src_path = str(REPO_ROOT / "apps" / "cli" / "src")
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = (
        f"{src_path}:{existing_pythonpath}" if existing_pythonpath else src_path
    )

    process = subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        check=False,
        cwd=str(REPO_ROOT / "apps" / "cli"),
        env=env,
    )

    if process.returncode != 0:
        raise RuntimeError(
            f"CLI failed ({process.returncode}): {process.stderr or process.stdout}"
        )

    try:
        return json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"CLI did not emit valid JSON: {process.stdout}") from exc


def default_worker_id(prefix: str = "openclaw") -> str:
    configured = os.environ.get("OPENCLAW_WORKER_ID") or os.environ.get("TM_WORKER_ID")
    if configured and configured.strip():
        return configured.strip()
    hostname = socket.gethostname().split(".")[0] or "host"
    return f"{prefix}-{hostname}"


def build_cli_args(tool: str, payload: Dict[str, Any]) -> List[str]:
    if tool == "task_get_next":
        statuses = payload.get("status", ["pending", "in_progress"])
        execution_modes = payload.get("execution_mode", ["autonomous"])
        args = [
            "task",
            "get-next",
            "--assignee",
            payload.get("assignee", "ai"),
            "--status",
            ",".join(statuses),
            "--execution-mode",
            ",".join(execution_modes),
        ]
        if payload.get("worker_id"):
            args.extend(["--worker-id", str(payload["worker_id"])])
        if payload.get("lease_seconds") is not None:
            args.extend(["--lease-seconds", str(payload["lease_seconds"])])
        args.append("--json")
        return args

    if tool == "task_claim_next":
        statuses = payload.get("status", ["pending", "in_progress"])
        execution_modes = payload.get("execution_mode", ["autonomous"])
        worker_id = payload.get("worker_id") or default_worker_id()
        args = [
            "task",
            "claim-next",
            "--worker-id",
            str(worker_id),
            "--assignee",
            payload.get("assignee", "ai"),
            "--status",
            ",".join(statuses),
            "--execution-mode",
            ",".join(execution_modes),
        ]
        if payload.get("lease_seconds") is not None:
            args.extend(["--lease-seconds", str(payload["lease_seconds"])])
        args.append("--json")
        return args

    if tool == "task_get":
        args = ["task", "get", payload["task_id"]]
        if payload.get("with_comments", True):
            args.extend(["--with-comments"])
        args.append("--json")
        return args

    if tool == "task_update":
        args = ["task", "update", payload["task_id"]]
        if payload.get("status"):
            args.extend(["--status", payload["status"]])
        if payload.get("assignee"):
            args.extend(["--assignee", payload["assignee"]])
        if payload.get("execution_mode"):
            args.extend(["--execution-mode", payload["execution_mode"]])
        if payload.get("urgency") is not None:
            args.extend(["--urgency", str(payload["urgency"])])
        if "worker_id" in payload and payload["worker_id"] is not None:
            args.extend(["--worker-id", str(payload["worker_id"])])
        if payload.get("clear_worker"):
            args.append("--clear-worker")
        if "input_request" in payload:
            if payload["input_request"] is None:
                args.extend(["--input-request", "null"])
            else:
                args.extend(["--input-request", json.dumps(payload["input_request"])])
        args.append("--json")
        return args

    if tool == "comment_add":
        args = [
            "comment",
            "add",
            payload["task_id"],
            "--message",
            payload["message"],
            "--json",
        ]
        if payload.get("type"):
            args.extend(["--type", payload["type"]])
        if payload.get("attachment"):
            args.extend(["--attachment", payload["attachment"]])
        if "metadata" in payload:
            if payload["metadata"] is None:
                args.extend(["--metadata", "null"])
            else:
                args.extend(["--metadata", json.dumps(payload["metadata"])])
        return args

    if tool == "context_export":
        return [
            "context",
            "export",
            payload["task_id"],
            "--format",
            payload.get("format", "json"),
            "--json",
        ]

    if tool == "skill_run":
        args = [
            "skill",
            "run",
            payload["skill_id"],
            "--task",
            payload["task_id"],
            "--json",
        ]
        if payload.get("args"):
            args.extend(["--args", ",".join(payload["args"])])
        return args

    raise ValueError(f"Unsupported tool: {tool}")


def validate_with_schema(tool: str, direction: str, payload: Dict[str, Any]) -> None:
    schema = load_json(SCHEMA_ROOT / f"{tool}.{direction}.schema.json")
    jsonschema_validate(instance=payload, schema=schema)


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: invoke_tool.py <tool_name>", file=sys.stderr)
        sys.exit(2)

    tool = sys.argv[1]

    try:
        raw_input = sys.stdin.read().strip() or "{}"
        payload = json.loads(raw_input)
        validate_with_schema(tool, "input", payload)

        cli_args = build_cli_args(tool, payload)
        output = run_cli(cli_args)
        validate_with_schema(tool, "output", output)

        print(json.dumps(output))
    except (ValidationError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        error_payload = {"ok": False, "error": str(exc)}
        print(json.dumps(error_payload))
        sys.exit(1)


if __name__ == "__main__":
    main()
