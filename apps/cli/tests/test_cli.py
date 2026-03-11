import json
import os
import socket
from pathlib import Path
from types import SimpleNamespace

from typer.testing import CliRunner

from concentray_cli.main import app


runner = CliRunner()


def seed_store(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "tasks": [
                    {
                        "Task_ID": "task-1",
                        "Title": "Test task",
                        "Status": "Pending",
                        "Created_By": "Human",
                        "Assignee": "AI",
                        "Context_Link": None,
                        "AI_Urgency": 2,
                        "Input_Request": None,
                        "Input_Request_Version": None,
                        "Input_Response": None,
                        "Created_At": "2026-03-03T10:00:00+00:00",
                        "Updated_At": "2026-03-03T10:00:00+00:00",
                        "Updated_By": "Human",
                        "Version": 1,
                        "Field_Clock": {"Title": "2026-03-03T10:00:00+00:00"},
                        "Deleted_At": None,
                    }
                ],
                "comments": [],
            }
        )
    )


def test_get_next_returns_ai_task(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }

    result = runner.invoke(
        app,
        ["task", "get-next", "--assignee", "ai", "--status", "pending,in_progress", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["task"]["Task_ID"] == "task-1"


def test_task_update_writes_blocker(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }
    input_request = (
        '{"schema_version":"1.0","type":"choice","options":["main","staging"],'
        '"request_id":"r1","prompt":"pick","required":true,'
        '"created_at":"2026-03-03T10:00:00+00:00"}'
    )

    result = runner.invoke(
        app,
        ["task", "update", "task-1", "--status", "blocked", "--input-request", input_request, "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["task"]["Status"] == "Blocked"
    assert payload["task"]["Input_Request"]["type"] == "choice"
    assert payload["task"]["Worker_ID"] is None
    assert payload["task"]["Claimed_At"] is None


def test_task_claim_next_claims_for_worker(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }

    result = runner.invoke(
        app,
        ["task", "claim-next", "--worker-id", "codex-main", "--assignee", "ai", "--status", "pending,in_progress", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["task"]["Task_ID"] == "task-1"
    assert payload["task"]["Status"] == "In Progress"
    assert payload["task"]["Worker_ID"] == "codex-main"
    assert payload["task"]["Claimed_At"] is not None


def test_get_next_skips_live_claim_from_other_worker(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }

    claim_result = runner.invoke(
        app,
        ["task", "claim-next", "--worker-id", "codex-main", "--assignee", "ai", "--status", "pending,in_progress", "--json"],
        env={**os.environ, **env},
    )
    assert claim_result.exit_code == 0

    result = runner.invoke(
        app,
        ["task", "get-next", "--assignee", "ai", "--status", "pending,in_progress", "--worker-id", "claude-main", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["task"] is None


def test_get_next_returns_claimed_task_for_same_worker(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }

    claim_result = runner.invoke(
        app,
        ["task", "claim-next", "--worker-id", "codex-main", "--assignee", "ai", "--status", "pending,in_progress", "--json"],
        env={**os.environ, **env},
    )
    assert claim_result.exit_code == 0

    result = runner.invoke(
        app,
        ["task", "get-next", "--assignee", "ai", "--status", "pending,in_progress", "--worker-id", "codex-main", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["task"]["Task_ID"] == "task-1"
    assert payload["task"]["Worker_ID"] == "codex-main"


def test_task_update_clears_claim_when_reassigned_to_human(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }

    claim_result = runner.invoke(
        app,
        ["task", "claim-next", "--worker-id", "codex-main", "--assignee", "ai", "--status", "pending,in_progress", "--json"],
        env={**os.environ, **env},
    )
    assert claim_result.exit_code == 0

    result = runner.invoke(
        app,
        ["task", "update", "task-1", "--status", "blocked", "--assignee", "human", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["task"]["Status"] == "Blocked"
    assert payload["task"]["Assignee"] == "Human"
    assert payload["task"]["Worker_ID"] is None
    assert payload["task"]["Claimed_At"] is None


def test_context_export_contains_schema(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }

    result = runner.invoke(
        app,
        ["context", "export", "task-1", "--format", "json", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["context"]["schema_version"] == "1.0"


def test_comment_add_accepts_metadata(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
    }

    result = runner.invoke(
        app,
        [
            "comment",
            "add",
            "task-1",
            "--message",
            "tool call finished",
            "--type",
            "log",
            "--metadata",
            '{"step":"build","payload":{"ok":true,"files":2}}',
            "--json",
        ],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["comment"]["Metadata"]["step"] == "build"
    assert payload["comment"]["Metadata"]["payload"]["ok"] is True


def test_skill_run_allowlisted(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    allowlist = tmp_path / "skills.yaml"
    allowlist.write_text(
        """
skills:
  demo:
    command: ["bash", "-lc", "echo $TASK_ID"]
""".strip()
    )

    env = {
        "TM_PROVIDER": "local_json",
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "AI",
        "TM_SKILLS_ALLOWLIST": str(allowlist),
    }

    result = runner.invoke(
        app,
        ["skill", "run", "demo", "--task", "task-1", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert "task-1" in payload["stdout"]


def test_workspace_status(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)
    workspace_config = tmp_path / "workspaces.json"

    env = {"TM_WORKSPACE_CONFIG": str(workspace_config)}

    add_result = runner.invoke(
        app,
        [
            "workspace",
            "add",
            "--name",
            "personal",
            "--store",
            str(store),
            "--set-active",
            "--json",
        ],
        env={**os.environ, **env},
    )
    assert add_result.exit_code == 0

    status_result = runner.invoke(app, ["workspace", "status", "--json"], env={**os.environ, **env})
    assert status_result.exit_code == 0
    payload = json.loads(status_result.stdout)
    assert payload["active_workspace"] == "personal"
    assert payload["selected_workspace"]["provider"] == "local_json"


def test_workspace_remove_reassigns_active_workspace(tmp_path: Path) -> None:
    first_store = tmp_path / "default.json"
    second_store = tmp_path / "fitness.json"
    seed_store(first_store)
    seed_store(second_store)
    workspace_config = tmp_path / "workspaces.json"
    env = {"TM_WORKSPACE_CONFIG": str(workspace_config)}

    result = runner.invoke(
        app,
        ["init", "--store", str(first_store), "--workspace", "default", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0

    result = runner.invoke(
        app,
        ["workspace", "add", "--name", "fitness", "--store", str(second_store), "--set-active", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0

    result = runner.invoke(app, ["workspace", "remove", "fitness", "--json"], env={**os.environ, **env})
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["removed"] == "fitness"
    assert payload["active_workspace"] == "default"


def test_workspace_remove_rejects_last_workspace(tmp_path: Path) -> None:
    store = tmp_path / "default.json"
    seed_store(store)
    workspace_config = tmp_path / "workspaces.json"
    env = {"TM_WORKSPACE_CONFIG": str(workspace_config)}

    result = runner.invoke(
        app,
        ["init", "--store", str(store), "--workspace", "default", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0

    result = runner.invoke(app, ["workspace", "remove", "default"], env={**os.environ, **env})
    assert result.exit_code != 0
    assert "Cannot remove the last workspace" in result.output


def test_get_next_uses_active_workspace_without_provider_env(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)
    workspace_config = tmp_path / "workspaces.json"

    env = {
        "TM_WORKSPACE_CONFIG": str(workspace_config),
        "TM_PROVIDER": "",
        "TM_LOCAL_STORE": "",
        "TM_UPDATED_BY": "AI",
    }

    add_result = runner.invoke(
        app,
        [
            "workspace",
            "add",
            "--name",
            "personal",
            "--store",
            str(store),
            "--set-active",
            "--json",
        ],
        env={**os.environ, **env},
    )
    assert add_result.exit_code == 0

    result = runner.invoke(
        app,
        ["task", "get-next", "--assignee", "ai", "--status", "pending,in_progress", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["task"]["Task_ID"] == "task-1"


def test_default_help_hides_advanced_commands() -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    output = result.stdout.lower()
    assert "task" in output
    assert "comment" in output
    assert "context" in output
    assert "auth" not in output
    assert "workspace" not in output
    assert "connect" not in output
    assert "skill" not in output


def test_workspace_help_lists_workspace_commands() -> None:
    result = runner.invoke(app, ["workspace", "--help"])
    assert result.exit_code == 0
    output = result.stdout.lower()
    assert "status" in output
    assert "use" in output
    assert "add" in output
    assert "list" in output
    assert "remove" in output


def test_agent_install_codex_copies_skill(tmp_path: Path) -> None:
    install_root = tmp_path / "codex-home"

    result = runner.invoke(
        app,
        ["agent", "install", "codex", "--path", str(install_root), "--json"],
        env=os.environ.copy(),
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    skill_dir = install_root / "skills" / "concentray-task-operator"
    assert payload["ok"] is True
    assert skill_dir.exists()
    assert (skill_dir / "SKILL.md").exists()
    assert (skill_dir / "references" / "contracts.md").exists()


def test_agent_install_claude_writes_skill_agent_and_command(tmp_path: Path) -> None:
    install_root = tmp_path / ".claude"

    result = runner.invoke(
        app,
        ["agent", "install", "claude", "--scope", "project", "--path", str(install_root), "--json"],
        env=os.environ.copy(),
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True

    skill_dir = install_root / "skills" / "concentray-task-operator"
    agent_file = install_root / "agents" / "concentray-operator.md"
    command_file = install_root / "commands" / "concentray-next.md"

    assert skill_dir.exists()
    assert (skill_dir / "SKILL.md").exists()
    assert agent_file.exists()
    assert command_file.exists()
    assert "concentray-task-operator" in agent_file.read_text()
    assert "task claim-next" in command_file.read_text()


def test_agent_install_openclaw_runs_bootstrap(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_run(cmd, text, capture_output, check, cwd):  # type: ignore[no-untyped-def]
        captured["cmd"] = cmd
        captured["cwd"] = cwd
        return SimpleNamespace(returncode=0, stdout="bootstrap ok", stderr="")

    monkeypatch.setattr("concentray_cli.main.subprocess.run", fake_run)

    result = runner.invoke(app, ["agent", "install", "openclaw", "--json"], env=os.environ.copy())
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["target"] == "openclaw"
    assert "bootstrap_openclaw.sh" in " ".join(captured["cmd"])  # type: ignore[index]


def test_init_creates_default_workspace_and_store(tmp_path: Path) -> None:
    workspace_config = tmp_path / "workspaces.json"
    store = tmp_path / "store.json"
    env = {"TM_WORKSPACE_CONFIG": str(workspace_config)}

    result = runner.invoke(
        app,
        ["init", "--store", str(store), "--workspace", "default", "--json"],
        env={**os.environ, **env},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert store.exists()

    saved = json.loads(workspace_config.read_text())
    assert saved["active_workspace"] == "default"
    assert saved["workspaces"]["default"]["provider"] == "local_json"
    assert saved["workspaces"]["default"]["store"] == str(store.resolve())


def test_doctor_json_output_shape() -> None:
    result = runner.invoke(app, ["doctor", "--json"])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert "checks" in payload


def test_start_uses_next_free_port_when_requested_port_is_busy(monkeypatch) -> None:
    captured: dict[str, object] = {}

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        busy_port = sock.getsockname()[1]

        def fake_run_local_api_server(*, provider, provider_factory, host, port, uploads_dir) -> None:
            captured["host"] = host
            captured["port"] = port
            captured["uploads_dir"] = str(uploads_dir)

        monkeypatch.setattr("concentray_cli.main.run_local_api_server", fake_run_local_api_server)

        result = runner.invoke(
            app,
            ["start", "--no-web", "--host", "127.0.0.1", "--port", str(busy_port)],
            env=os.environ.copy(),
        )

    assert result.exit_code == 0
    assert f"Port {busy_port} is already in use." in result.stdout
    assert captured["host"] == "127.0.0.1"
    assert isinstance(captured["port"], int)
    assert captured["port"] != busy_port


def test_start_background_writes_runtime_metadata(monkeypatch, tmp_path: Path) -> None:
    runtime_dir = tmp_path / "runtime"
    captured_calls: list[dict[str, object]] = []
    captured_export: dict[str, object] = {}
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        requested_port = sock.getsockname()[1]

    class FakeProcess:
        def __init__(self, pid: int) -> None:
            self.pid = pid

        def poll(self) -> None:
            return None

    def fake_spawn_background_process(cmd, *, cwd, env, log_path):  # type: ignore[no-untyped-def]
        captured_calls.append(
            {
                "cmd": cmd,
                "cwd": str(cwd),
                "log_path": str(log_path),
            }
        )
        return FakeProcess(2000 + len(captured_calls))

    def fake_build_background_web_bundle(api_url, output_dir, log_path):  # type: ignore[no-untyped-def]
        captured_export["api_url"] = api_url
        captured_export["output_dir"] = str(output_dir)
        captured_export["log_path"] = str(log_path)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "index.html").write_text("<html></html>")

    monkeypatch.setattr("concentray_cli.main.spawn_background_process", fake_spawn_background_process)
    monkeypatch.setattr("concentray_cli.main.build_background_web_bundle", fake_build_background_web_bundle)
    monkeypatch.setattr("concentray_cli.main.time.sleep", lambda _: None)
    monkeypatch.setattr("concentray_cli.main.shutil.which", lambda name: "/opt/homebrew/bin/pnpm" if name == "pnpm" else None)

    env = {**os.environ, "TM_RUNTIME_DIR": str(runtime_dir)}
    result = runner.invoke(
        app,
        ["start", "--background", "--host", "127.0.0.1", "--port", str(requested_port)],
        env=env,
    )

    assert result.exit_code == 0
    metadata = json.loads((runtime_dir / "dev-session.json").read_text())
    assert metadata["api_url"] == f"http://127.0.0.1:{requested_port}"
    assert metadata["api_pid"] == 2001
    assert metadata["web_pid"] == 2002
    assert metadata["web_mode"] == "static_export"
    assert metadata["web_url"] == f"http://127.0.0.1:{metadata['web_port']}"
    assert len(captured_calls) == 2
    assert "serve-local-api" in captured_calls[0]["cmd"]  # type: ignore[operator]
    assert captured_export["api_url"] == f"http://127.0.0.1:{requested_port}"
    assert "http.server" in " ".join(captured_calls[1]["cmd"])  # type: ignore[index]
    assert f"Started background API on http://127.0.0.1:{requested_port}" in result.stdout


def test_start_background_lan_uses_detected_public_host(monkeypatch, tmp_path: Path) -> None:
    runtime_dir = tmp_path / "runtime"
    captured_calls: list[dict[str, object]] = []
    captured_export: dict[str, object] = {}

    class FakeProcess:
        def __init__(self, pid: int) -> None:
            self.pid = pid

        def poll(self) -> None:
            return None

    def fake_spawn_background_process(cmd, *, cwd, env, log_path):  # type: ignore[no-untyped-def]
        captured_calls.append(
            {
                "cmd": cmd,
                "cwd": str(cwd),
                "log_path": str(log_path),
            }
        )
        return FakeProcess(3000 + len(captured_calls))

    def fake_build_background_web_bundle(api_url, output_dir, log_path):  # type: ignore[no-untyped-def]
        captured_export["api_url"] = api_url
        captured_export["output_dir"] = str(output_dir)
        captured_export["log_path"] = str(log_path)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "index.html").write_text("<html></html>")

    monkeypatch.setattr("concentray_cli.main.spawn_background_process", fake_spawn_background_process)
    monkeypatch.setattr("concentray_cli.main.build_background_web_bundle", fake_build_background_web_bundle)
    monkeypatch.setattr("concentray_cli.main.time.sleep", lambda _: None)
    monkeypatch.setattr("concentray_cli.main.shutil.which", lambda name: "/opt/homebrew/bin/pnpm" if name == "pnpm" else None)
    monkeypatch.setattr("concentray_cli.main.detect_lan_ip", lambda: "192.168.1.23")

    env = {**os.environ, "TM_RUNTIME_DIR": str(runtime_dir)}
    result = runner.invoke(
        app,
        ["start", "--background", "--lan", "--port", "8787"],
        env=env,
    )

    assert result.exit_code == 0
    metadata = json.loads((runtime_dir / "dev-session.json").read_text())
    assert metadata["bind_host"] == "0.0.0.0"
    assert metadata["public_host"] == "192.168.1.23"
    assert metadata["api_url"] == "http://192.168.1.23:8787"
    assert metadata["web_url"] == f"http://192.168.1.23:{metadata['web_port']}"
    assert captured_export["api_url"] == "http://192.168.1.23:8787"
    assert captured_calls[0]["cmd"][captured_calls[0]["cmd"].index("--host") + 1] == "0.0.0.0"  # type: ignore[index]
    assert captured_calls[1]["cmd"][-1] == "0.0.0.0"  # type: ignore[index]


def test_start_requires_public_host_for_wildcard_bind() -> None:
    result = runner.invoke(
        app,
        ["start", "--no-web", "--host", "0.0.0.0", "--port", "8787"],
        env=os.environ.copy(),
    )

    assert result.exit_code != 0
    assert "--public-host is required" in result.output


def test_status_reports_background_runtime(monkeypatch, tmp_path: Path) -> None:
    runtime_dir = tmp_path / "runtime"
    runtime_dir.mkdir(parents=True)
    (runtime_dir / "dev-session.json").write_text(
        json.dumps(
            {
                "api_pid": 4321,
                "web_pid": 5432,
                "api_url": "http://127.0.0.1:8787",
            }
        )
    )
    monkeypatch.setattr("concentray_cli.main.pid_is_running", lambda pid: pid == 4321)

    result = runner.invoke(app, ["status", "--json"], env={**os.environ, "TM_RUNTIME_DIR": str(runtime_dir)})
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["running"] is True
    assert payload["runtime"]["api_running"] is True
    assert payload["runtime"]["web_running"] is False


def test_stop_clears_background_runtime(monkeypatch, tmp_path: Path) -> None:
    runtime_dir = tmp_path / "runtime"
    runtime_dir.mkdir(parents=True)
    metadata_path = runtime_dir / "dev-session.json"
    metadata_path.write_text(
        json.dumps(
            {
                "api_pid": 4321,
                "web_pid": 5432,
                "api_url": "http://127.0.0.1:8787",
            }
        )
    )
    stopped: list[int] = []

    def fake_terminate_background_pid(pid):  # type: ignore[no-untyped-def]
        if pid:
            stopped.append(pid)
        return True

    monkeypatch.setattr("concentray_cli.main.terminate_background_pid", fake_terminate_background_pid)

    result = runner.invoke(app, ["stop", "--json"], env={**os.environ, "TM_RUNTIME_DIR": str(runtime_dir)})
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["stopped"] is True
    assert stopped == [4321, 5432]
    assert not metadata_path.exists()


def test_serve_local_api_uses_next_free_port_when_requested_port_is_busy(monkeypatch) -> None:
    captured: dict[str, object] = {}

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        busy_port = sock.getsockname()[1]

        def fake_run_local_api_server(*, provider, provider_factory, host, port, uploads_dir) -> None:
            captured["host"] = host
            captured["port"] = port
            captured["uploads_dir"] = str(uploads_dir)

        monkeypatch.setattr("concentray_cli.main.run_local_api_server", fake_run_local_api_server)

        result = runner.invoke(
            app,
            ["serve-local-api", "--host", "127.0.0.1", "--port", str(busy_port)],
            env=os.environ.copy(),
        )

    assert result.exit_code == 0
    assert f"Port {busy_port} is already in use." in result.stdout
    assert captured["host"] == "127.0.0.1"
    assert isinstance(captured["port"], int)
    assert captured["port"] != busy_port
