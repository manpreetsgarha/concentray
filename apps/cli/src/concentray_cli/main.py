from __future__ import annotations

import json
import os
import signal
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import typer
from dotenv import load_dotenv

from concentray_cli.context import build_context_envelope
from concentray_cli.local_api_server import run_local_api_server
from concentray_cli.models import Actor, Comment, CommentType, Task, TaskStatus, UpdatedBy, iso_now
from concentray_cli.providers.local_json import LocalJsonProvider
from concentray_cli.provider_factory import make_provider
from concentray_cli.skills.runner import run_skill
from concentray_cli.workspace_store import (
    default_workspace_name,
    get_selected_workspace,
    load_workspace_config,
    save_workspace_config,
    suggested_workspace_store,
    workspace_config_path,
)

app = typer.Typer(help="Concentray CLI")
task_app = typer.Typer(help="Task commands")
comment_app = typer.Typer(help="Comment commands")
context_app = typer.Typer(help="Context commands")
skill_app = typer.Typer(help="Skill commands")
workspace_app = typer.Typer(help="Workspace commands")
agent_app = typer.Typer(help="Agent integration commands")

app.add_typer(task_app, name="task")
app.add_typer(comment_app, name="comment")
app.add_typer(context_app, name="context")
app.add_typer(skill_app, name="skill", hidden=True)
app.add_typer(workspace_app, name="workspace", hidden=True)
app.add_typer(agent_app, name="agent", hidden=True)


def emit(payload: Dict[str, object], as_json: bool) -> None:
    if as_json:
        typer.echo(json.dumps(payload, indent=2))
    else:
        typer.echo(payload)


def project_root() -> Path:
    override = (os.getenv("CONCENTRAY_ROOT", "") or os.getenv("TM_PROJECT_ROOT", "")).strip()
    if override:
        return Path(override).expanduser().resolve()
    # /.../apps/cli/src/concentray_cli/main.py -> project root is 4 parents up
    return Path(__file__).resolve().parents[4]


def default_local_store() -> Path:
    return Path(".data/store.json")


def canonical_store_path(path: Path) -> Path:
    expanded = path.expanduser()
    if expanded.is_absolute():
        return expanded
    return (project_root() / expanded).resolve()


def runtime_dir_path() -> Path:
    override = os.getenv("TM_RUNTIME_DIR", "").strip()
    if override:
        return canonical_store_path(Path(override))
    return canonical_store_path(Path(".data/runtime"))


def runtime_metadata_path() -> Path:
    return runtime_dir_path() / "dev-session.json"


def runtime_log_path(name: str) -> Path:
    return runtime_dir_path() / f"{name}.log"


def bundled_skill_path() -> Path:
    return project_root() / "skills" / "concentray-task-operator"


def pid_is_running(pid: Optional[int]) -> bool:
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def load_runtime_metadata() -> Optional[Dict[str, Any]]:
    path = runtime_metadata_path()
    if not path.exists():
        return None
    return json.loads(path.read_text())


def save_runtime_metadata(payload: Dict[str, Any]) -> None:
    path = runtime_metadata_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def clear_runtime_metadata() -> None:
    path = runtime_metadata_path()
    if path.exists():
        path.unlink()


def active_runtime_metadata() -> Optional[Dict[str, Any]]:
    payload = load_runtime_metadata()
    if not payload:
        return None

    api_pid = payload.get("api_pid")
    web_pid = payload.get("web_pid")
    if pid_is_running(api_pid) or pid_is_running(web_pid):
        return payload

    clear_runtime_metadata()
    return None


def tail_text(path: Path, lines: int = 20) -> str:
    if not path.exists():
        return ""
    return "\n".join(path.read_text(errors="replace").splitlines()[-lines:])


def spawn_background_process(
    cmd: List[str],
    *,
    cwd: Path,
    env: Dict[str, str],
    log_path: Path,
) -> subprocess.Popen[Any]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a") as handle:
        process = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    return process


def build_background_web_bundle(api_url: str, output_dir: Path, log_path: Path) -> None:
    client_dir = project_root() / "apps" / "client"
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    env = dict(os.environ)
    env["EXPO_NO_DOTENV"] = "1"
    env["EXPO_PUBLIC_LOCAL_API_URL"] = api_url
    env.setdefault("EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB", os.getenv("EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB", "25"))
    env.setdefault("BROWSER", "none")

    process = subprocess.run(
        [
            "pnpm",
            "--dir",
            str(client_dir),
            "exec",
            "expo",
            "export",
            "--platform",
            "web",
            "--output-dir",
            str(output_dir),
        ],
        text=True,
        capture_output=True,
        check=False,
        cwd=str(project_root()),
        env=env,
    )
    log_path.write_text((process.stdout or "") + (process.stderr or ""))
    if process.returncode != 0:
        raise typer.BadParameter(
            "Background web export failed.\n"
            f"Log: {log_path}\n"
            f"{tail_text(log_path)}"
        )


def terminate_background_pid(pid: Optional[int]) -> bool:
    if not pid_is_running(pid):
        return False

    assert pid is not None
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return False
    except OSError:
        os.kill(pid, signal.SIGTERM)

    deadline = time.time() + 5
    while time.time() < deadline:
        if not pid_is_running(pid):
            return True
        time.sleep(0.1)

    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    except OSError:
        os.kill(pid, signal.SIGKILL)

    deadline = time.time() + 2
    while time.time() < deadline:
        if not pid_is_running(pid):
            return True
        time.sleep(0.1)

    return not pid_is_running(pid)


def copy_directory(source: Path, destination: Path, force: bool) -> None:
    if destination.exists():
        if not force:
            raise typer.BadParameter(f"Destination already exists: {destination}. Use --force to overwrite.")
        if destination.is_dir():
            shutil.rmtree(destination)
        else:
            destination.unlink()
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination)


def write_text_file(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        raise typer.BadParameter(f"Destination already exists: {path}. Use --force to overwrite.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def render_claude_subagent(wrapper_command: str, store_path: str) -> str:
    return f"""---
name: concentray-operator
description: Handles queued, resumable, human-in-the-loop work through Concentray. Use when tasks should be read from or updated in Concentray instead of managed ad hoc in chat.
model: sonnet
skills:
  - concentray-task-operator
---
Treat Concentray as the source of truth for task state.

Shared runtime:
- wrapper: `{wrapper_command}`
- store: `{store_path}`
- use a stable worker id for this session, for example `claude-$(hostname -s)`

When no specific task id is provided:
1. Run `{wrapper_command} task claim-next --worker-id claude-$(hostname -s) --assignee ai --status pending,in_progress --json`
2. If no task is available, say so briefly and stop.
3. Otherwise follow the preloaded `concentray-task-operator` skill.
"""


def render_claude_command(wrapper_command: str) -> str:
    return f"""---
description: Pull the next AI task from Concentray and run the operator loop
argument-hint: [optional-focus]
allowed-tools: Read,Glob,Grep,Edit,Write,Bash({wrapper_command}:*)
---
Use the `concentray-task-operator` skill and treat Concentray as the source of truth for task state.

Start by running:

`{wrapper_command} task claim-next --worker-id claude-$(hostname -s) --assignee ai --status pending,in_progress --json`

If no task exists, say so briefly and stop.

If a task exists:
1. Read it with `task get --with-comments`
2. Export structured context with `context export`
3. Perform the work
4. Post progress with `comment add`
5. Update status with `task update`

If `$ARGUMENTS` is provided, treat it as extra focus guidance, not as a replacement for task context.
"""


def resolve_local_api_port(host: str, preferred_port: int, search_window: int = 25) -> int:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    last_error: Optional[OSError] = None

    for candidate in range(preferred_port, preferred_port + search_window):
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, candidate))
            except OSError as exc:
                last_error = exc
                continue
        return candidate

    detail = f"could not find a free port in range {preferred_port}-{preferred_port + search_window - 1}"
    if last_error is not None:
        detail = f"{detail}: {last_error}"
    raise typer.BadParameter(detail)


def detect_lan_ip() -> str:
    override = os.getenv("TM_LAN_IP", "").strip()
    if override:
        return override

    candidates: List[str] = []

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            candidates.append(sock.getsockname()[0])
    except OSError:
        pass

    try:
        host_name = socket.gethostname()
        for family, _, _, _, sockaddr in socket.getaddrinfo(host_name, None, socket.AF_INET, socket.SOCK_STREAM):
            if family != socket.AF_INET:
                continue
            ip = sockaddr[0]
            if ip:
                candidates.append(ip)
    except OSError:
        pass

    for candidate in candidates:
        if candidate and not candidate.startswith("127."):
            return candidate

    raise typer.BadParameter(
        "Could not detect a LAN IP automatically. Pass --public-host <LAN_IP> or set TM_LAN_IP."
    )


def resolve_network_hosts(host: str, *, lan: bool, public_host: Optional[str]) -> Tuple[str, str]:
    normalized_public = (public_host or "").strip() or None

    if lan:
        return "0.0.0.0", normalized_public or detect_lan_ip()

    if host in {"0.0.0.0", "::"} and not normalized_public:
        raise typer.BadParameter("--public-host is required when --host is a wildcard address.")

    return host, normalized_public or host


def resolve_local_store_path(store_override: Optional[str] = None) -> Path:
    load_dotenv()
    if store_override:
        return canonical_store_path(Path(store_override))

    env_store = os.getenv("TM_LOCAL_STORE", "").strip()
    if env_store:
        return Path(env_store).expanduser()

    payload = load_workspace_config()
    selected_workspace = get_selected_workspace(payload)
    if selected_workspace and str(selected_workspace.get("provider", "")).lower() == "local_json":
        selected_store = str(selected_workspace.get("store", "")).strip()
        if selected_store:
            return canonical_store_path(Path(selected_store))

    return canonical_store_path(default_local_store())


def parse_statuses(raw: str) -> List[TaskStatus]:
    mapping = {
        "pending": TaskStatus.PENDING,
        "in_progress": TaskStatus.IN_PROGRESS,
        "blocked": TaskStatus.BLOCKED,
        "done": TaskStatus.DONE,
    }
    result: List[TaskStatus] = []
    for item in raw.split(","):
        key = item.strip().lower()
        if key not in mapping:
            raise typer.BadParameter(f"Unsupported status '{item}'")
        result.append(mapping[key])
    return result


def parse_actor(raw: str) -> Actor:
    mapping = {
        "ai": Actor.AI,
        "human": Actor.HUMAN,
    }
    key = raw.strip().lower()
    if key not in mapping:
        raise typer.BadParameter("Actor must be 'ai' or 'human'")
    return mapping[key]


def parse_updated_by(raw: str) -> UpdatedBy:
    mapping = {
        "ai": UpdatedBy.AI,
        "human": UpdatedBy.HUMAN,
        "system": UpdatedBy.SYSTEM,
    }
    key = raw.strip().lower()
    if key not in mapping:
        raise typer.BadParameter("TM_UPDATED_BY must be one of: AI, Human, System")
    return mapping[key]


def normalize_worker_id(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    value = raw.strip()
    return value or None


def parse_json_object_option(raw: Optional[str], *, option_name: str) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    value = raw.strip()
    if not value or value.lower() == "null":
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise typer.BadParameter(f"Invalid {option_name} JSON: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise typer.BadParameter(f"{option_name} must be a JSON object or null")
    return parsed


@workspace_app.command("status")
def workspace_status(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = load_workspace_config()
    selected = get_selected_workspace(payload)
    emit(
        {
            "ok": True,
            "config_path": str(workspace_config_path()),
            "active_workspace": payload.get("active_workspace"),
            "selected_workspace": selected,
            "workspaces_count": len(payload.get("workspaces") or {}),
        },
        as_json,
    )


@workspace_app.command("use")
def workspace_use(
    name: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    if name not in workspaces:
        raise typer.BadParameter(f"Workspace '{name}' not found")
    payload["active_workspace"] = name
    save_workspace_config(payload)
    emit(
        {
            "ok": True,
            "active_workspace": name,
            "config_path": str(workspace_config_path()),
        },
        as_json,
    )


@workspace_app.command("add")
def workspace_add(
    name: str = typer.Option(..., "--name"),
    store: Optional[str] = typer.Option(None, "--store"),
    set_active: bool = typer.Option(True, "--set-active/--no-set-active"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    store_path = canonical_store_path(Path(store)) if store else canonical_store_path(suggested_workspace_store(name))
    provider = LocalJsonProvider(store_path)
    provider.list_tasks()

    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    workspaces[name] = {
        "provider": "local_json",
        "store": str(store_path),
    }
    payload["workspaces"] = workspaces
    if set_active or not payload.get("active_workspace"):
        payload["active_workspace"] = name
    save_workspace_config(payload)

    emit(
        {
            "ok": True,
            "workspace": name,
            "provider": "local_json",
            "store": str(store_path),
            "active_workspace": payload.get("active_workspace"),
            "config_path": str(workspace_config_path()),
        },
        as_json,
    )


@workspace_app.command("list")
def workspace_list(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    active = payload.get("active_workspace")
    result = []
    for name in sorted(workspaces.keys()):
        record = workspaces.get(name) or {}
        result.append(
            {
                "name": name,
                "provider": record.get("provider"),
                "store": record.get("store"),
                "active": name == active,
            }
        )
    emit({"ok": True, "workspaces": result, "active_workspace": active}, as_json)


@workspace_app.command("remove")
def workspace_remove(
    name: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    if name not in workspaces:
        raise typer.BadParameter(f"Workspace '{name}' not found")
    if len(workspaces) <= 1:
        raise typer.BadParameter("Cannot remove the last workspace")

    del workspaces[name]
    payload["workspaces"] = workspaces
    if payload.get("active_workspace") == name:
        payload["active_workspace"] = sorted(workspaces.keys())[0]
    save_workspace_config(payload)
    emit(
        {
            "ok": True,
            "removed": name,
            "active_workspace": payload.get("active_workspace"),
        },
        as_json,
    )


@agent_app.command("install")
def agent_install(
    target: str,
    scope: Optional[str] = typer.Option(None, "--scope"),
    path: Optional[str] = typer.Option(None, "--path"),
    force: bool = typer.Option(False, "--force"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    repo = project_root()
    bundled_skill = bundled_skill_path()
    if not bundled_skill.exists():
        raise typer.BadParameter(f"Bundled skill not found: {bundled_skill}")

    normalized_target = target.strip().lower()
    if normalized_target == "codex":
        install_root = Path(path).expanduser() if path else Path(os.getenv("CODEX_HOME", "~/.codex")).expanduser()
        skill_destination = install_root / "skills" / bundled_skill.name
        copy_directory(bundled_skill, skill_destination, force)
        emit(
            {
                "ok": True,
                "target": "codex",
                "installed": {
                    "skill": str(skill_destination),
                },
            },
            as_json,
        )
        return

    if normalized_target == "claude":
        normalized_scope = (scope or "project").strip().lower()
        if normalized_scope not in {"project", "user"}:
            raise typer.BadParameter("--scope must be 'project' or 'user'")

        install_root = (
            Path(path).expanduser()
            if path
            else (repo / ".claude" if normalized_scope == "project" else Path("~/.claude").expanduser())
        )
        if normalized_scope == "project" and install_root.resolve() == (repo / ".claude").resolve():
            wrapper_command = "./scripts/concentray"
            store_path = "./.data/store.json"
        else:
            wrapper_command = str(repo / "scripts" / "concentray")
            store_path = str(repo / ".data" / "store.json")

        skill_destination = install_root / "skills" / bundled_skill.name
        copy_directory(bundled_skill, skill_destination, force)

        agent_file = install_root / "agents" / "concentray-operator.md"
        command_file = install_root / "commands" / "concentray-next.md"
        write_text_file(agent_file, render_claude_subagent(wrapper_command, store_path), force)
        write_text_file(command_file, render_claude_command(wrapper_command), force)

        emit(
            {
                "ok": True,
                "target": "claude",
                "scope": normalized_scope,
                "installed": {
                    "skill": str(skill_destination),
                    "agent": str(agent_file),
                    "command": str(command_file),
                },
            },
            as_json,
        )
        return

    if normalized_target == "openclaw":
        script = repo / "scripts" / "bootstrap" / "bootstrap_openclaw.sh"
        process = subprocess.run(
            ["bash", str(script)],
            text=True,
            capture_output=True,
            check=False,
            cwd=str(repo),
        )
        if process.returncode != 0:
            raise typer.BadParameter(process.stderr.strip() or process.stdout.strip() or "OpenClaw install failed")
        emit(
            {
                "ok": True,
                "target": "openclaw",
                "profile": str(repo / ".generated" / "openclaw" / "default-agent.toml"),
                "allowlist": str(repo / ".generated" / "openclaw" / "allowlist.toml"),
                "stdout": process.stdout.strip(),
            },
            as_json,
        )
        return

    raise typer.BadParameter("target must be one of: codex, claude, openclaw")


@task_app.command("get-next")
def task_get_next(
    assignee: str = typer.Option("ai", "--assignee"),
    status: str = typer.Option("pending,in_progress", "--status"),
    worker_id: Optional[str] = typer.Option(None, "--worker-id"),
    lease_seconds: int = typer.Option(1800, "--lease-seconds"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    next_task = provider.get_next_task(
        assignee=assignee,
        statuses=parse_statuses(status),
        worker_id=normalize_worker_id(worker_id),
        lease_seconds=lease_seconds,
    )
    emit(
        {
            "ok": True,
            "task": next_task.model_dump(by_alias=True) if next_task else None,
        },
        as_json,
    )


@task_app.command("claim-next")
def task_claim_next(
    worker_id: str = typer.Option(..., "--worker-id"),
    assignee: str = typer.Option("ai", "--assignee"),
    status: str = typer.Option("pending,in_progress", "--status"),
    lease_seconds: int = typer.Option(1800, "--lease-seconds"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "AI"))
    claimed = provider.claim_next_task(
        worker_id=worker_id,
        assignee=assignee,
        statuses=parse_statuses(status),
        updated_by=updated_by,
        lease_seconds=lease_seconds,
    )
    emit(
        {
            "ok": True,
            "task": claimed.model_dump(by_alias=True) if claimed else None,
        },
        as_json,
    )


@task_app.command("get")
def task_get(
    task_id: str,
    with_comments: bool = typer.Option(False, "--with-comments"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    comments = provider.list_comments(task_id) if with_comments else []

    emit(
        {
            "ok": task is not None,
            "task": task.model_dump(by_alias=True) if task else None,
            "comments": [c.model_dump(by_alias=True) for c in comments],
        },
        as_json,
    )


@task_app.command("update")
def task_update(
    task_id: str,
    status: Optional[str] = typer.Option(None, "--status"),
    assignee: Optional[str] = typer.Option(None, "--assignee"),
    urgency: Optional[int] = typer.Option(None, "--urgency"),
    input_request: Optional[str] = typer.Option(None, "--input-request"),
    worker_id: Optional[str] = typer.Option(None, "--worker-id"),
    clear_worker: bool = typer.Option(False, "--clear-worker"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    now = iso_now()
    updated_by_env = os.getenv("TM_UPDATED_BY", "AI")
    updated_by = parse_updated_by(updated_by_env)

    patch_fields = {}
    if status is not None:
        status_mapping = {
            "pending": TaskStatus.PENDING,
            "in_progress": TaskStatus.IN_PROGRESS,
            "blocked": TaskStatus.BLOCKED,
            "done": TaskStatus.DONE,
        }
        if status.lower() not in status_mapping:
            raise typer.BadParameter("Invalid --status")
        patch_fields["status"] = status_mapping[status.lower()]

    if assignee is not None:
        patch_fields["assignee"] = parse_actor(assignee)

    if urgency is not None:
        if urgency < 1 or urgency > 5:
            raise typer.BadParameter("--urgency must be between 1 and 5")
        patch_fields["ai_urgency"] = urgency

    if input_request is not None:
        if input_request.strip() == "null":
            patch_fields["input_request"] = None
            patch_fields["input_request_version"] = None
        else:
            parsed = json.loads(input_request)
            patch_fields["input_request"] = parsed
            patch_fields["input_request_version"] = parsed.get("schema_version", "1.0")

    normalized_worker = normalize_worker_id(worker_id)
    if normalized_worker is not None:
        patch_fields["worker_id"] = normalized_worker
        patch_fields["claimed_at"] = now

    next_status = patch_fields.get("status", task.status)
    next_assignee = patch_fields.get("assignee", task.assignee)
    if clear_worker or next_status != TaskStatus.IN_PROGRESS or next_assignee != Actor.AI:
        patch_fields["worker_id"] = None
        patch_fields["claimed_at"] = None

    for field_name in patch_fields:
        task.field_clock[field_name] = now

    updated = task.model_copy(
        update={
            **patch_fields,
            "updated_at": now,
            "updated_by": updated_by,
            "version": task.version + 1,
            "field_clock": task.field_clock,
        }
    )

    provider.upsert_task(updated)

    emit(
        {
            "ok": True,
            "task": updated.model_dump(by_alias=True),
        },
        as_json,
    )


@task_app.command("delete")
def task_delete(
    task_id: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "AI"))
    deleted = provider.delete_task(task_id, updated_by=updated_by)
    if not deleted:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    emit(
        {
            "ok": True,
            "task": deleted.model_dump(by_alias=True),
        },
        as_json,
    )


@comment_app.command("add")
def comment_add(
    task_id: str,
    message: str = typer.Option(..., "--message"),
    type: str = typer.Option("message", "--type"),
    attachment: Optional[str] = typer.Option(None, "--attachment"),
    metadata: Optional[str] = typer.Option(None, "--metadata"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    type_map = {
        "message": CommentType.MESSAGE,
        "log": CommentType.LOG,
        "decision": CommentType.DECISION,
        "attachment": CommentType.ATTACHMENT,
    }

    if type.lower() not in type_map:
        raise typer.BadParameter("Invalid comment --type")

    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "AI"))
    author = Actor.AI if updated_by == UpdatedBy.SYSTEM else Actor(updated_by.value)
    parsed_metadata = parse_json_object_option(metadata, option_name="--metadata")

    comment = Comment(
        Task_ID=task_id,
        Author=author,
        Message=message,
        Type=type_map[type.lower()],
        Attachment_Link=attachment,
        Metadata=parsed_metadata,
    )

    provider.add_comment(comment)
    emit(
        {
            "ok": True,
            "comment": comment.model_dump(by_alias=True),
        },
        as_json,
    )


@context_app.command("export")
def context_export(
    task_id: str,
    format: str = typer.Option("json", "--format"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    if format != "json":
        raise typer.BadParameter("Only json format is supported in v1")

    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    comments = provider.list_comments(task_id)
    envelope = build_context_envelope(task, comments)
    emit(
        {
            "ok": True,
            "context": envelope,
        },
        as_json,
    )


@skill_app.command("run")
def skill_run(
    skill_id: str,
    task: str = typer.Option(..., "--task"),
    args: Optional[str] = typer.Option("", "--args"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    load_dotenv()
    allowlist = os.getenv("TM_SKILLS_ALLOWLIST", "skills/skills.yaml")
    extra_args = [item for item in args.split(",") if item.strip()]

    result = run_skill(
        allowlist_path=Path(allowlist),
        skill_id=skill_id,
        task_id=task,
        extra_args=extra_args,
    )

    emit(
        {
            "ok": result.exit_code == 0,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
        },
        as_json,
    )


@app.command("init")
def init_workspace(
    store: Optional[str] = typer.Option(
        None,
        "--store",
        help="Local JSON store path for shared workspace data.",
    ),
    workspace: str = typer.Option(
        default_workspace_name(),
        "--workspace",
        help="Workspace to create/set active.",
    ),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    store_path = canonical_store_path(Path(store)) if store else canonical_store_path(suggested_workspace_store(workspace))
    provider = LocalJsonProvider(store_path)
    provider.list_tasks()

    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    workspaces[workspace] = {
        "provider": "local_json",
        "store": str(store_path),
    }
    payload["workspaces"] = workspaces
    payload["active_workspace"] = workspace
    save_workspace_config(payload)

    emit(
        {
            "ok": True,
            "provider": "local_json",
            "store": str(store_path),
            "workspace": workspace,
            "active_workspace": payload.get("active_workspace"),
            "config_path": str(workspace_config_path()),
        },
        as_json,
    )


@app.command("doctor")
def doctor(as_json: bool = typer.Option(False, "--json")) -> None:
    checks: List[Dict[str, Any]] = []

    checks.append(
        {
            "name": "python3.11",
            "ok": bool(shutil.which("python3.11")),
            "fix": "Install Python 3.11 and ensure it is in PATH.",
        }
    )
    checks.append(
        {
            "name": "pnpm",
            "ok": bool(shutil.which("pnpm")),
            "fix": "Install pnpm: npm install -g pnpm",
        }
    )

    ok_all = all(item["ok"] for item in checks)

    if as_json:
        emit({"ok": ok_all, "checks": checks}, True)
        return

    for item in checks:
        status = "ok" if item["ok"] else "warn"
        typer.echo(f"[{status}] {item['name']}")
        if not item["ok"]:
            typer.echo(f"  fix: {item['fix']}")

    if ok_all:
        typer.echo("Doctor: core setup looks good.")
    else:
        typer.echo("Doctor: action required. Apply fixes above.")


@app.command("start")
def start_workspace(
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8787, "--port"),
    store: Optional[str] = typer.Option(None, "--store"),
    uploads_dir: str = typer.Option(".data/uploads", "--uploads-dir"),
    lan: bool = typer.Option(
        False,
        "--lan",
        help="Expose the API and web UI on the local network using the detected LAN IP.",
    ),
    public_host: Optional[str] = typer.Option(
        None,
        "--public-host",
        help="Host or IP clients should use for URLs when binding to a different interface.",
    ),
    background: bool = typer.Option(
        False,
        "--background/--foreground",
        help="Detach the local API and web runtime into background processes.",
    ),
    web: bool = typer.Option(
        True,
        "--web/--no-web",
        help="Start Expo web app together with local API.",
    ),
) -> None:
    bind_host, url_host = resolve_network_hosts(host, lan=lan, public_host=public_host)

    resolved_port = resolve_local_api_port(bind_host, port)
    if resolved_port != port:
        typer.echo(f"Port {port} is already in use. Using {resolved_port} for the local API.")

    resolved_store = resolve_local_store_path(store) if store else None
    resolved_uploads_dir = canonical_store_path(Path(uploads_dir))

    if background:
        existing = active_runtime_metadata()
        if existing:
            api_url = existing.get("api_url")
            raise typer.BadParameter(
                f"Background runtime already active at {api_url}. Run `./scripts/concentray stop` first."
            )

        if web and not shutil.which("pnpm"):
            raise typer.BadParameter("pnpm was not found in PATH. Install pnpm or run with --no-web.")

        runtime_dir = runtime_dir_path()
        api_log = runtime_log_path("api")
        web_log = runtime_log_path("web")
        runtime_dir.mkdir(parents=True, exist_ok=True)
        api_log.write_text("")
        if web:
            web_log.write_text("")

        web_output_dir: Optional[Path] = None
        web_port: Optional[int] = None
        web_url: Optional[str] = None
        if web:
            web_output_dir = runtime_dir / "web-dist"
            web_port = resolve_local_api_port(bind_host, 8081)
            web_url = f"http://{url_host}:{web_port}"
            if web_port != 8081:
                typer.echo(f"Port 8081 is already in use. Using {web_port} for the background web server.")
            build_background_web_bundle(
                api_url=f"http://{url_host}:{resolved_port}",
                output_dir=web_output_dir,
                log_path=web_log,
            )

        child_env = dict(os.environ)
        src_path = str(project_root() / "apps" / "cli" / "src")
        existing_pythonpath = child_env.get("PYTHONPATH", "")
        child_env["PYTHONPATH"] = f"{src_path}:{existing_pythonpath}" if existing_pythonpath else src_path

        api_cmd = [
            sys.executable,
            "-m",
            "concentray_cli.main",
            "serve-local-api",
            "--host",
            bind_host,
            "--port",
            str(resolved_port),
            "--uploads-dir",
            str(resolved_uploads_dir),
        ]
        if resolved_store:
            api_cmd.extend(["--store", str(resolved_store)])

        api_process = spawn_background_process(
            api_cmd,
            cwd=project_root() / "apps" / "cli",
            env=child_env,
            log_path=api_log,
        )
        time.sleep(0.3)
        if api_process.poll() is not None:
            raise typer.BadParameter(
                "Background API failed to start.\n"
                f"Log: {api_log}\n"
                f"{tail_text(api_log)}"
            )

        web_process: Optional[subprocess.Popen[Any]] = None
        if web:
            web_process = spawn_background_process(
                [sys.executable, "-m", "http.server", str(web_port), "--bind", bind_host],
                cwd=web_output_dir or project_root(),
                env=dict(child_env),
                log_path=web_log,
            )
            time.sleep(0.3)
            if web_process.poll() is not None:
                terminate_background_pid(api_process.pid)
                raise typer.BadParameter(
                    "Background web process failed to start.\n"
                    f"Log: {web_log}\n"
                    f"{tail_text(web_log)}"
                )

        payload = {
            "ok": True,
            "mode": "background",
            "started_at": iso_now(),
            "host": url_host,
            "bind_host": bind_host,
            "api_port": resolved_port,
            "api_url": f"http://{url_host}:{resolved_port}",
            "api_pid": api_process.pid,
            "api_log": str(api_log),
            "web": web,
            "web_mode": "static_export" if web else None,
            "web_pid": web_process.pid if web_process else None,
            "web_log": str(web_log) if web else None,
            "web_port": web_port,
            "web_url": web_url,
            "store": str(resolved_store) if resolved_store else None,
            "uploads_dir": str(resolved_uploads_dir),
            "lan": lan,
            "public_host": url_host,
        }
        save_runtime_metadata(payload)
        typer.echo(f"Started background API on {payload['api_url']} (pid {api_process.pid})")
        typer.echo(f"API log: {api_log}")
        if web_process:
            typer.echo(f"Started background web server on {web_url} (pid {web_process.pid})")
            typer.echo(f"Web log: {web_log}")
        typer.echo("Use `./scripts/concentray status` to inspect and `./scripts/concentray stop` to stop.")
        return

    provider: Optional[LocalJsonProvider] = None
    provider_factory = make_provider
    if resolved_store:
        provider = LocalJsonProvider(resolved_store)
        provider_factory = None

    web_process: Optional[subprocess.Popen[Any]] = None
    if web:
        client_dir = project_root() / "apps" / "client"
        env = dict(os.environ)
        env["EXPO_NO_DOTENV"] = "1"
        env.setdefault("EXPO_PUBLIC_LOCAL_API_URL", f"http://{url_host}:{resolved_port}")
        env.setdefault("EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB", os.getenv("EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB", "25"))
        try:
            web_cmd = ["pnpm", "--dir", str(client_dir), "web"]
            if lan:
                web_cmd = ["pnpm", "--dir", str(client_dir), "exec", "expo", "start", "--web", "--host", "lan"]
            web_process = subprocess.Popen(web_cmd, env=env)
            typer.echo(f"Started web app in {client_dir} (EXPO_PUBLIC_LOCAL_API_URL={env['EXPO_PUBLIC_LOCAL_API_URL']})")
        except FileNotFoundError as exc:
            raise typer.BadParameter(
                "pnpm was not found in PATH. Install pnpm or run with --no-web."
            ) from exc

    if lan:
        typer.echo(f"LAN mode enabled. Reach this machine on http://{url_host}:{resolved_port} for the API.")
    typer.echo(f"Starting local shared API on http://{url_host}:{resolved_port}")
    try:
        run_local_api_server(
            provider=provider,
            provider_factory=provider_factory,
            host=bind_host,
            port=resolved_port,
            uploads_dir=resolved_uploads_dir,
        )
    finally:
        if web_process and web_process.poll() is None:
            web_process.terminate()
            try:
                web_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                web_process.kill()


@app.command("serve-local-api")
def serve_local_api(
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8787, "--port"),
    store: Optional[str] = typer.Option(None, "--store"),
    uploads_dir: str = typer.Option(".data/uploads", "--uploads-dir"),
) -> None:
    resolved_port = resolve_local_api_port(host, port)
    if resolved_port != port:
        typer.echo(f"Port {port} is already in use. Using {resolved_port} for the local API.")

    provider: Optional[LocalJsonProvider] = None
    provider_factory = make_provider
    if store:
        provider = LocalJsonProvider(resolve_local_store_path(store))
        provider_factory = None
    typer.echo(f"Starting local shared API on http://{host}:{resolved_port}")
    run_local_api_server(
        provider=provider,
        provider_factory=provider_factory,
        host=host,
        port=resolved_port,
        uploads_dir=canonical_store_path(Path(uploads_dir)),
    )


@app.command("status")
def runtime_status(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = load_runtime_metadata()
    if not payload:
        emit({"ok": True, "running": False, "runtime": None}, as_json)
        return

    runtime = {
        **payload,
        "api_running": pid_is_running(payload.get("api_pid")),
        "web_running": pid_is_running(payload.get("web_pid")),
    }
    if not runtime["api_running"] and not runtime["web_running"]:
        clear_runtime_metadata()
        runtime = {**runtime, "stale": True}

    emit(
        {
            "ok": True,
            "running": runtime["api_running"] or runtime["web_running"],
            "runtime": runtime,
        },
        as_json,
    )


@app.command("stop")
def stop_runtime(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = load_runtime_metadata()
    if not payload:
        emit({"ok": True, "stopped": False, "reason": "no_runtime"}, as_json)
        return

    stopped_api = terminate_background_pid(payload.get("api_pid"))
    stopped_web = terminate_background_pid(payload.get("web_pid"))
    clear_runtime_metadata()
    emit(
        {
            "ok": True,
            "stopped": stopped_api or stopped_web,
            "api_pid": payload.get("api_pid"),
            "web_pid": payload.get("web_pid"),
        },
        as_json,
    )


def main() -> None:
    app()


if __name__ == "__main__":
    main()
