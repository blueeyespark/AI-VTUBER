from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .mesh import BlueMesh
from .relay import BlueMeshLanTransport, BlueMeshTransportError, generate_pairing_token, post_bundle

DEFAULT_DB = "Project Blue App/.blue/bluemesh.db"
DEFAULT_NODE = "local_blue_node"
DEFAULT_CREATOR = "local_creator"


def _load_pairing_token(value: str | None) -> str:
    token = value or os.environ.get("BLUEMESH_PAIRING_TOKEN", "")
    if not token:
        raise SystemExit("Missing pairing token. Pass --token or set BLUEMESH_PAIRING_TOKEN for this session.")
    return token


def _print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True))


def command_token(_args: argparse.Namespace) -> int:
    token = generate_pairing_token()
    print(token)
    return 0


def command_export(args: argparse.Namespace) -> int:
    token = _load_pairing_token(args.token)
    with BlueMesh(args.db) as mesh:
        bundle = BlueMeshLanTransport(mesh, token).export_bundle(source_node_id=args.node_id)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(bundle, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    _print_json({"status": "exported", "output": str(args.output)})
    return 0


def command_import(args: argparse.Namespace) -> int:
    token = _load_pairing_token(args.token)
    bundle = json.loads(Path(args.input).read_text(encoding="utf-8"))
    with BlueMesh(args.db) as mesh:
        result = BlueMeshLanTransport(mesh, token).import_bundle(
            bundle,
            target_node_id=args.node_id,
            creator_id=args.creator_id,
            approved=args.approve,
        )
    _print_json(result.to_dict())
    return 0


def command_push(args: argparse.Namespace) -> int:
    token = _load_pairing_token(args.token)
    with BlueMesh(args.db) as mesh:
        bundle = BlueMeshLanTransport(mesh, token).export_bundle(source_node_id=args.node_id)
    response = post_bundle(args.peer, bundle, timeout=args.timeout)
    _print_json(response)
    return 0


def command_preflight(args: argparse.Namespace) -> int:
    token = args.token or os.environ.get("BLUEMESH_PAIRING_TOKEN", "")
    db_path = Path(args.db)
    peer = args.peer or ""
    report = {
        "status": "ready" if token and db_path.exists() else "needs_setup",
        "database": str(db_path),
        "database_exists": db_path.exists(),
        "node_id": args.node_id,
        "creator_id": args.creator_id,
        "peer": peer,
        "peer_configured": peer.startswith("http://") or peer.startswith("https://"),
        "pairing_token_present": bool(token),
        "pairing_token_stored": False,
        "safe_workflow": [
            "Use one session-only pairing token for both trusted PCs.",
            "Run serve on the receiving PC.",
            "Run push from the sending PC.",
            "Reverse direction if both PCs changed Blue.",
            "Approve imports and resolve conflicts instead of blind overwrite.",
        ],
        "security": {
            "env_files_synced": False,
            "tokens_synced": False,
            "imports_require_approval": True,
            "identity_mismatch_refused": True,
        },
    }
    _print_json(report)
    return 0


def command_serve(args: argparse.Namespace) -> int:
    token = _load_pairing_token(args.token)
    db_path = args.db
    node_id = args.node_id
    creator_id = args.creator_id
    approve_imports = args.approve_imports

    class Handler(BaseHTTPRequestHandler):
        server_version = "BlueMeshLAN/0.1"

        def _send(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802 - http.server naming
            if self.path.rstrip("/") == "/health":
                self._send(200, {"status": "ok", "service": "BlueMesh LAN"})
            else:
                self._send(404, {"status": "not_found"})

        def do_POST(self) -> None:  # noqa: N802 - http.server naming
            if self.path.rstrip("/") != "/sync":
                self._send(404, {"status": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > args.max_bytes:
                    self._send(413, {"status": "too_large"})
                    return
                bundle = json.loads(self.rfile.read(length).decode("utf-8"))
                with BlueMesh(db_path) as mesh:
                    result = BlueMeshLanTransport(mesh, token).import_bundle(
                        bundle,
                        target_node_id=node_id,
                        creator_id=creator_id,
                        approved=approve_imports,
                    )
                self._send(200, result.to_dict())
            except (BlueMeshTransportError, ValueError, json.JSONDecodeError) as exc:
                self._send(400, {"status": "error", "error": str(exc)})
            except Exception as exc:  # pragma: no cover - safety net for manual server runs
                self._send(500, {"status": "error", "error": str(exc)})

        def log_message(self, format: str, *values: Any) -> None:  # noqa: A002
            if args.verbose:
                super().log_message(format, *values)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"BlueMesh LAN bridge listening on http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop. Pairing token is session-only and not stored.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping BlueMesh LAN bridge.")
    finally:
        server.server_close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="BlueMesh LAN/Wi-Fi signed sync bridge.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("token", help="Generate a session-only pairing token.").set_defaults(func=command_token)

    export = sub.add_parser("export", help="Export this BlueMesh database into a signed bundle file.")
    export.add_argument("--db", default=DEFAULT_DB)
    export.add_argument("--token")
    export.add_argument("--node-id", default=DEFAULT_NODE)
    export.add_argument("--output", required=True)
    export.set_defaults(func=command_export)

    import_cmd = sub.add_parser("import", help="Import a signed peer bundle file.")
    import_cmd.add_argument("--db", default=DEFAULT_DB)
    import_cmd.add_argument("--token")
    import_cmd.add_argument("--node-id", default=DEFAULT_NODE)
    import_cmd.add_argument("--creator-id", default=DEFAULT_CREATOR)
    import_cmd.add_argument("--input", required=True)
    import_cmd.add_argument("--approve", action="store_true", help="Approve importing the signed bundle into this node.")
    import_cmd.set_defaults(func=command_import)

    push = sub.add_parser("push", help="Push this node's signed bundle to a peer LAN bridge.")
    push.add_argument("--db", default=DEFAULT_DB)
    push.add_argument("--token")
    push.add_argument("--node-id", default=DEFAULT_NODE)
    push.add_argument("--peer", required=True, help="Peer base URL, for example http://192.168.1.50:8765")
    push.add_argument("--timeout", type=float, default=10.0)
    push.set_defaults(func=command_push)

    preflight = sub.add_parser("preflight", help="Print a safe LAN sync readiness report without sending data.")
    preflight.add_argument("--db", default=DEFAULT_DB)
    preflight.add_argument("--token")
    preflight.add_argument("--node-id", default=DEFAULT_NODE)
    preflight.add_argument("--creator-id", default=DEFAULT_CREATOR)
    preflight.add_argument("--peer", default="")
    preflight.set_defaults(func=command_preflight)

    serve = sub.add_parser("serve", help="Run a local LAN bridge that accepts signed BlueMesh bundles.")
    serve.add_argument("--db", default=DEFAULT_DB)
    serve.add_argument("--token")
    serve.add_argument("--node-id", default=DEFAULT_NODE)
    serve.add_argument("--creator-id", default=DEFAULT_CREATOR)
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--max-bytes", type=int, default=2_000_000)
    serve.add_argument("--approve-imports", action="store_true", help="Allow this server to import valid signed bundles.")
    serve.add_argument("--verbose", action="store_true")
    serve.set_defaults(func=command_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
