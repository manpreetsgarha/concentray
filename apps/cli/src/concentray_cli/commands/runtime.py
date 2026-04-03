from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import typer

from concentray_cli.local_api_server import run_local_api_server
from concentray_cli.models import iso_now
from concentray_cli.output import emit
from concentray_cli.paths import canonical_store_path, project_root, resolve_local_store_path
from concentray_cli.providers.local_json import LocalJsonProvider
from concentray_cli.provider_factory import make_provider
from concentray_cli import runtime_support
from concentray_cli.workspace_store import (
    default_workspace_name,
    load_workspace_config,
    save_workspace_config,
    suggested_workspace_store,
    workspace_config_path,
)

runtime_app = typer.Typer(help="Runtime commands")


@runtime_app.command("init")
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
        "store": str(store_path),
    }
    payload["workspaces"] = workspaces
    payload["active_workspace"] = workspace
    save_workspace_config(payload)

    emit(
        {
            "ok": True,
            "store": str(store_path),
            "workspace": workspace,
            "active_workspace": payload.get("active_workspace"),
            "config_path": str(workspace_config_path()),
        },
        as_json,
    )


@runtime_app.command("doctor")
def doctor(as_json: bool = typer.Option(False, "--json")) -> None:
    checks: List[Dict[str, Any]] = []

    checks.append(
        {
            "name": "python3",
            "ok": bool(shutil.which("python3")),
            "fix": "Install Python 3 and ensure it is in PATH.",
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


@runtime_app.command("start")
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
    bind_host, url_host = runtime_support.resolve_network_hosts(host, lan=lan, public_host=public_host)

    resolved_port = runtime_support.resolve_local_api_port(bind_host, port)
    if resolved_port != port:
        typer.echo(f"Port {port} is already in use. Using {resolved_port} for the local API.")

    resolved_store = resolve_local_store_path(store) if store else None
    resolved_uploads_dir = canonical_store_path(Path(uploads_dir))

    if background:
        existing = runtime_support.active_runtime_metadata()
        if existing:
            api_url = existing.get("api_url")
            raise typer.BadParameter(
                f"Background runtime already active at {api_url}. Run `./scripts/concentray stop` first."
            )

        if web and not shutil.which("pnpm"):
            raise typer.BadParameter("pnpm was not found in PATH. Install pnpm or run with --no-web.")

        runtime_dir = runtime_support.runtime_dir_path()
        api_log = runtime_support.runtime_log_path("api")
        web_log = runtime_support.runtime_log_path("web")
        runtime_dir.mkdir(parents=True, exist_ok=True)
        api_log.write_text("")
        if web:
            web_log.write_text("")

        web_output_dir: Optional[Path] = None
        web_port: Optional[int] = None
        web_url: Optional[str] = None
        if web:
            web_output_dir = runtime_dir / "web-dist"
            web_port = runtime_support.resolve_local_api_port(bind_host, 8081)
            web_url = f"http://{url_host}:{web_port}"
            if web_port != 8081:
                typer.echo(f"Port 8081 is already in use. Using {web_port} for the background web server.")
            runtime_support.build_background_web_bundle(
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

        api_process = runtime_support.spawn_background_process(
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
                f"{runtime_support.tail_text(api_log)}"
            )

        web_process: Optional[subprocess.Popen[Any]] = None
        if web:
            web_process = runtime_support.spawn_background_process(
                [sys.executable, "-m", "http.server", str(web_port), "--bind", bind_host],
                cwd=web_output_dir or project_root(),
                env=dict(child_env),
                log_path=web_log,
            )
            time.sleep(0.3)
            if web_process.poll() is not None:
                runtime_support.terminate_background_pid(api_process.pid)
                raise typer.BadParameter(
                    "Background web process failed to start.\n"
                    f"Log: {web_log}\n"
                    f"{runtime_support.tail_text(web_log)}"
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
        runtime_support.save_runtime_metadata(payload)
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
                runtime_support.build_client_contracts(runtime_support.runtime_log_path("contracts-build"))
                web_cmd = ["pnpm", "--dir", str(client_dir), "exec", "expo", "start", "--web", "--host", "lan"]
            web_process = subprocess.Popen(web_cmd, env=env)
            typer.echo(f"Started web app in {client_dir} (EXPO_PUBLIC_LOCAL_API_URL={env['EXPO_PUBLIC_LOCAL_API_URL']})")
        except FileNotFoundError as exc:
            raise typer.BadParameter("pnpm was not found in PATH. Install pnpm or run with --no-web.") from exc

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


@runtime_app.command("serve-local-api")
def serve_local_api(
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8787, "--port"),
    store: Optional[str] = typer.Option(None, "--store"),
    uploads_dir: str = typer.Option(".data/uploads", "--uploads-dir"),
) -> None:
    resolved_port = runtime_support.resolve_local_api_port(host, port)
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


@runtime_app.command("status")
def runtime_status(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = runtime_support.load_runtime_metadata()
    if not payload:
        emit({"ok": True, "running": False, "runtime": None}, as_json)
        return

    runtime = {
        **payload,
        "api_running": runtime_support.pid_is_running(payload.get("api_pid")),
        "web_running": runtime_support.pid_is_running(payload.get("web_pid")),
    }
    if not runtime["api_running"] and not runtime["web_running"]:
        runtime_support.clear_runtime_metadata()
        runtime = {**runtime, "stale": True}

    emit(
        {
            "ok": True,
            "running": runtime["api_running"] or runtime["web_running"],
            "runtime": runtime,
        },
        as_json,
    )


@runtime_app.command("stop")
def stop_runtime(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = runtime_support.load_runtime_metadata()
    if not payload:
        emit({"ok": True, "stopped": False, "reason": "no_runtime"}, as_json)
        return

    stopped_api = runtime_support.terminate_background_pid(payload.get("api_pid"))
    stopped_web = runtime_support.terminate_background_pid(payload.get("web_pid"))
    runtime_support.clear_runtime_metadata()
    emit(
        {
            "ok": True,
            "stopped": stopped_api or stopped_web,
            "api_pid": payload.get("api_pid"),
            "web_pid": payload.get("web_pid"),
        },
        as_json,
    )
