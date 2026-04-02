from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import typer

from concentray_cli.paths import canonical_store_path, project_root


def runtime_dir_path() -> Path:
    override = os.getenv("TM_RUNTIME_DIR", "").strip()
    if override:
        return canonical_store_path(Path(override))
    return canonical_store_path(Path(".data/runtime"))


def runtime_metadata_path() -> Path:
    return runtime_dir_path() / "dev-session.json"


def runtime_log_path(name: str) -> Path:
    return runtime_dir_path() / f"{name}.log"


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
        import shutil

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
            "Background web export failed.\n" f"Log: {log_path}\n" f"{tail_text(log_path)}"
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
