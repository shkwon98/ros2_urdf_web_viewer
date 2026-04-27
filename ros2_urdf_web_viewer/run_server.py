from __future__ import annotations

import argparse
import json
import mimetypes
import posixpath
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    from ament_index_python.packages import (
        PackageNotFoundError,
        get_package_share_directory,
    )
except (
    ImportError
):  # pragma: no cover - useful when running unit tests outside ROS.
    PackageNotFoundError = KeyError
    get_package_share_directory = None


PACKAGE_NAME = "ros2_urdf_web_viewer"


def safe_resource_path(package_root: Path, relative_path: str) -> Path:
    root = package_root.resolve()
    decoded_path = unquote(relative_path)
    normalized_path = posixpath.normpath(decoded_path)

    if normalized_path in {"", "."}:
        candidate = root
    else:
        if (
            normalized_path.startswith("/")
            or normalized_path == ".."
            or normalized_path.startswith("../")
        ):
            raise ValueError(
                f"requested resource is outside package: {relative_path}"
            )
        candidate = root / normalized_path

    try:
        candidate.relative_to(root)
    except ValueError:
        raise ValueError(
            f"requested resource is outside package: {relative_path}"
        )

    return candidate


def build_viewer_config(
    *,
    rosbridge_port: str | int | None = None,
) -> dict[str, str | int]:
    config: dict[str, str | int] = {}
    if rosbridge_port not in (None, ""):
        config["rosbridgePort"] = int(rosbridge_port)
    return config


def cache_control_for_request_path(request_path: str, cache_seconds: int) -> str:
    parsed_path = urlparse(request_path).path
    if parsed_path.startswith("/packages/"):
        return f"public, max-age={max(0, cache_seconds)}"
    return "no-store"


def default_web_root() -> Path:
    if get_package_share_directory is not None:
        try:
            return Path(get_package_share_directory(PACKAGE_NAME)) / "web"
        except PackageNotFoundError:
            pass

    return Path(__file__).resolve().parents[1] / "web"


class ViewerRequestHandler(SimpleHTTPRequestHandler):
    server_version = "Ros2UrdfWebViewer/0.1"

    def __init__(
        self,
        *args,
        directory: str,
        viewer_config: dict[str, str | int],
        cache_seconds: int,
        **kwargs,
    ):
        self.viewer_config = viewer_config
        self.cache_seconds = cache_seconds
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if not urlparse(self.path).path.startswith("/packages/"):
            self.send_header(
                "Cache-Control",
                cache_control_for_request_path(self.path, self.cache_seconds),
            )
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/viewer-config.js":
            self._send_viewer_config()
            return
        if parsed.path.startswith("/packages/"):
            self._send_package_file(parsed.path)
            return
        super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/viewer-config.js":
            body = self._viewer_config_body()
            self._send_bytes_headers("application/javascript", len(body))
            return
        if parsed.path.startswith("/packages/"):
            self._send_package_file(parsed.path, head_only=True)
            return
        super().do_HEAD()

    def _viewer_config_body(self) -> bytes:
        config_json = json.dumps(self.viewer_config, sort_keys=True)
        return f"window.ROS_URDF_VIEWER_CONFIG = {config_json};\n".encode(
            "utf-8"
        )

    def _send_viewer_config(self):
        body = self._viewer_config_body()
        self._send_bytes_headers("application/javascript", len(body))
        self.wfile.write(body)

    def _send_bytes_headers(self, content_type: str, content_length: int):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.end_headers()

    def _send_package_file(self, request_path: str, head_only: bool = False):
        parts = request_path.removeprefix("/packages/").split("/", 1)
        if len(parts) != 2 or not parts[0] or not parts[1]:
            self.send_error(404, "package resource not found")
            return

        package_name = unquote(parts[0])
        relative_path = parts[1]

        if get_package_share_directory is None:
            self.send_error(500, "ament_index_python is not available")
            return

        try:
            package_root = Path(get_package_share_directory(package_name))
            target = safe_resource_path(package_root, relative_path)
        except PackageNotFoundError:
            self.send_error(404, f"package not found: {package_name}")
            return
        except ValueError:
            self.send_error(403, "package resource path is not allowed")
            return

        if not target.is_file():
            self.send_error(404, "package resource not found")
            return

        content_type = (
            mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        )
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(target.stat().st_size))
        self.send_header(
            "Cache-Control",
            cache_control_for_request_path(request_path, self.cache_seconds),
        )
        self.end_headers()

        if not head_only:
            with target.open("rb") as package_file:
                self.copyfile(package_file, self.wfile)


def make_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Serve the ROS 2 URDF web viewer."
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--rosbridge-port", default="")
    parser.add_argument("--web-root", type=Path, default=None)
    parser.add_argument("--cache-seconds", type=int, default=3600)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = make_arg_parser()
    args, _ = parser.parse_known_args(argv)

    web_root = args.web_root or default_web_root()
    viewer_config = build_viewer_config(
        rosbridge_port=args.rosbridge_port,
    )
    handler = partial(
        ViewerRequestHandler,
        directory=str(web_root),
        viewer_config=viewer_config,
        cache_seconds=args.cache_seconds,
    )

    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        url_host = "localhost" if args.host in {"", "0.0.0.0"} else args.host
        print(
            f"Serving ROS 2 URDF viewer at http://{url_host}:{args.port}",
            flush=True,
        )
        server.serve_forever()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
