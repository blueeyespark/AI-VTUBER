from __future__ import annotations

import html
import ipaddress
import secrets
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

from project_blue import __version__
from project_blue.core import BlueCore


def _escape(value: object) -> str:
    return html.escape(str(value), quote=True)


def _hidden(token: str) -> str:
    return f'<input type="hidden" name="csrf" value="{_escape(token)}">'


def render_dashboard(core: BlueCore, token: str, query: str = "") -> str:
    report = core.doctor()
    projects = core.storage.list_projects()
    tasks = core.storage.list_tasks(status="open")
    memories = core.storage.list_memories(limit=10)
    approvals = core.storage.list_approvals(status="pending", limit=10)
    sources = core.storage.list_sources()
    conversations = core.storage.list_conversations()
    receipts = core.storage.list_execution_receipts(limit=10)
    workspaces = core.storage.list_workspaces()
    file_changes = core.storage.list_proposed_changes(limit=10)
    artifacts = core.storage.list_forge_artifacts(limit=10)
    execution_runs = core.storage.list_execution_runs(limit=10)
    academy_answers = core.storage.list_academy_answers(limit=10)
    academy_lessons = core.storage.list_academy_lessons(limit=10)
    forge_bundles = core.storage.list_forge_bundles(limit=10)
    academy_assessments = core.storage.list_academy_assessments(limit=10)
    academy_submissions = core.storage.list_academy_submissions(limit=10)
    results = core.storage.unified_search(query, 30) if query else []
    csrf = _hidden(token)

    project_options = "".join(
        f'<option value="{_escape(row["id"])}">{_escape(row["name"])}</option>'
        for row in projects
    )
    memory_rows = "".join(
        "<li><strong>"
        + _escape(row["title"])
        + "</strong><small>"
        + _escape(row["sensitivity"])
        + "</small><p>"
        + _escape(row["content"])
        + "</p></li>"
        for row in memories
    ) or "<li>No memories yet.</li>"
    project_rows = "".join(
        f'<li><strong>{_escape(row["name"])}</strong>'
        f'<small>{_escape(row["status"])}</small>'
        f'<p>{_escape(row["description"])}</p></li>'
        for row in projects
    ) or "<li>No projects yet.</li>"
    task_rows = "".join(
        f'<li><form method="post" action="/task/complete">{csrf}'
        f'<input type="hidden" name="task_id" value="{_escape(row["id"])}">'
        f'<button class="done" type="submit">Complete</button></form>'
        f'<strong>{_escape(row["title"])}</strong>'
        f'<small>{_escape(row["priority"])}</small>'
        f'<p>{_escape(row["details"])}</p></li>'
        for row in tasks
    ) or "<li>No open tasks.</li>"
    approval_rows = "".join(
        f'<li><strong>{_escape(row["action_type"])}</strong>'
        f'<small>quorum {_escape(row["required_votes"])} · expires {_escape(row["expires_at"] or "never")}</small>'
        f'<p>{_escape(row["summary"])}</p>'
        f'<form method="post" action="/approval/decide">{csrf}'
        f'<input type="hidden" name="approval_id" value="{_escape(row["id"])}">'
        '<button name="decision" value="approved">Approve</button>'
        '<button class="danger" name="decision" value="denied">Deny</button>'
        "</form></li>"
        for row in approvals
    ) or "<li>No pending approvals.</li>"
    search_rows = "".join(
        f'<li><small>{_escape(row["type"])}</small>'
        f'<strong>{_escape(row["title"])}</strong>'
        f'<p>{_escape(row["body"])}</p></li>'
        for row in results
    )
    source_rows = "".join(
        f'<li><strong>{_escape(row["title"])}</strong>'
        f'<small>{_escape(row["media_type"])} · {_escape(row["sha256"][:12])}…</small>'
        f'<p>{_escape(row["original_path"])}</p></li>'
        for row in sources
    ) or "<li>No sources yet. Add trusted text sources from the CLI.</li>"
    conversation_rows = "".join(
        f'<li><strong>{_escape(row["title"])}</strong>'
        f'<small>{_escape(row["id"])}</small></li>'
        for row in conversations
    ) or "<li>No named conversations yet.</li>"
    receipt_rows = "".join(
        f'<li><strong>{_escape(row["outcome"])}</strong>'
        f'<small>approval {_escape(row["approval_id"])}</small>'
        f'<p>{_escape(row["details"])}</p></li>'
        for row in receipts
    ) or "<li>No execution receipts yet.</li>"
    workspace_rows = "".join(
        f'<li><strong>{_escape(row["name"])}</strong>'
        f'<small>{_escape(row["mode"])} · indexed {_escape(row["indexed_at"] or "never")}</small>'
        f'<p>{_escape(row["root_path"])}</p>'
        f'<p>Access: {_escape(", ".join(access["principal"] + "=" + access["role"] for access in core.storage.list_workspace_access(row["id"])))}</p></li>'
        for row in workspaces
    ) or "<li>No registered project workspaces.</li>"
    def change_row(row: dict[str, Any]) -> str:
        controls = ""
        if row["status"] == "proposed":
            controls = (
                f'<form method="post" action="/approval/decide">{csrf}'
                f'<input type="hidden" name="approval_id" value="{_escape(row["approval_id"])}">'
                '<button name="decision" value="approved">Approve diff</button>'
                '<button class="danger" name="decision" value="denied">Deny diff</button>'
                "</form>"
            )
        elif row["status"] == "applied" and not row["rollback_approval_id"]:
            controls = (
                f'<form method="post" action="/change/rollback-request">{csrf}'
                f'<input type="hidden" name="change_id" value="{_escape(row["id"])}">'
                '<button type="submit">Request rollback approval</button></form>'
            )
        elif row["status"] == "applied" and row["rollback_approval_id"]:
            rollback_approval = core.storage.get_approval(row["rollback_approval_id"])
            if rollback_approval and rollback_approval["status"] == "approved":
                controls = (
                    f'<form method="post" action="/change/rollback">{csrf}'
                    f'<input type="hidden" name="change_id" value="{_escape(row["id"])}">'
                    '<button class="danger" type="submit">Execute approved rollback</button></form>'
                )
            else:
                controls = (
                    f'<p>Rollback approval: {_escape(rollback_approval["status"] if rollback_approval else "missing")}</p>'
                )
        return (
            f'<li><strong>{_escape(row["relative_path"])}</strong>'
            f'<small>{_escape(row["status"])} · approval {_escape(row["approval_id"])}</small>'
            f'<pre>{_escape(row["unified_diff"])}</pre>{controls}</li>'
        )

    change_rows = "".join(change_row(row) for row in file_changes) or (
        "<li>No file changes proposed.</li>"
    )
    artifact_rows = "".join(
        f'<li><strong>{_escape(row["title"])}</strong>'
        f'<small>{_escape(row["kind"])} · {_escape(row["status"])} · {_escape(row["sha256"][:12])}…</small></li>'
        for row in artifacts
    ) or "<li>No Forge artifacts.</li>"
    run_rows = "".join(
        f'<li><strong>{_escape(row["runner"])}</strong>'
        f'<small>{_escape(row["status"])} · approval {_escape(row["approval_id"])}</small>'
        f'<p>{_escape(row["stderr"] or row["stdout"] or "")}</p></li>'
        for row in execution_runs
    ) or "<li>No Forge runs.</li>"
    academy_rows = "".join(
        f'<li><strong>{_escape(row["question"])}</strong>'
        f'<p>{_escape(row["answer"])}</p></li>'
        for row in academy_answers
    ) or "<li>No Academy answers.</li>"
    lesson_rows = "".join(
        f'<li><strong>{_escape(row["title"])}</strong>'
        f'<small>sha256 {_escape(row["content_sha256"])}</small>'
        f'<p>{_escape(row["content"])}</p></li>'
        for row in academy_lessons
    ) or "<li>No Academy lessons.</li>"
    bundle_rows = "".join(
        f'<li><strong>{_escape(row["name"])}</strong>'
        f'<small>{_escape(row["template"])} · {_escape(row["status"])} · '
        f'{len(core.storage.list_forge_bundle_items(row["id"]))} files</small></li>'
        for row in forge_bundles
    ) or "<li>No Forge bundles.</li>"
    assessment_rows = "".join(
        f'<li><strong>{_escape(row["title"])}</strong>'
        f'<small>human review · lesson {_escape(row["lesson_id"])}</small></li>'
        for row in academy_assessments
    ) or "<li>No Academy assessments.</li>"
    submission_rows = "".join(
        f'<li><strong>{_escape(row["principal"])}</strong>'
        f'<small>{_escape(row["status"])} · assessment '
        f'{_escape(row["assessment_id"])}</small></li>'
        for row in academy_submissions
    ) or "<li>No Academy submissions.</li>"

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Project Blue</title>
<style>
:root{{--bg:#07111f;--panel:#102238;--ink:#eaf4ff;--muted:#9ab2c9;--blue:#54b4ff;--line:#29425c;--bad:#ff6b7a}}
*{{box-sizing:border-box}} body{{margin:0;background:linear-gradient(135deg,#06101c,#0b1d31);
color:var(--ink);font:15px system-ui,sans-serif}} header{{padding:24px max(20px,5vw);border-bottom:1px solid var(--line)}}
h1{{margin:0;color:var(--blue)}} main{{padding:24px max(20px,5vw);display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:18px}}
section{{background:rgba(16,34,56,.94);border:1px solid var(--line);border-radius:14px;padding:18px}} .wide{{grid-column:1/-1}}
h2{{margin-top:0}} input,textarea,select,button{{width:100%;margin:5px 0;padding:10px;border-radius:8px;border:1px solid var(--line);background:#081625;color:var(--ink)}}
textarea{{min-height:85px;resize:vertical}} button{{background:#1672b8;border:0;font-weight:700;cursor:pointer}} button:hover{{background:#2189d8}}
button.done{{width:auto;float:right}} button.danger{{background:#9b3040}} ul{{list-style:none;padding:0;margin:0}} li{{border-top:1px solid var(--line);padding:12px 0;overflow:auto}}
li:first-child{{border-top:0}} small{{color:var(--muted);display:block}} p{{color:#c8d8e7;margin:6px 0;white-space:pre-wrap}} .healthy{{color:#73e2a7}}
pre{{overflow:auto;background:#06101c;border:1px solid var(--line);padding:10px;border-radius:8px;color:#d8ecff}}
</style></head><body>
<header><h1>Project Blue</h1><div class="healthy">Local core healthy · v{_escape(__version__)} · {_escape(report["audit_message"])}</div></header>
<main>
<section class="wide"><h2>Search Blue</h2>
<form method="get" action="/"><input name="q" value="{_escape(query)}" placeholder="Search memory, projects, and tasks"></form>
<ul>{search_rows}</ul></section>
<section><h2>Talk to Blue</h2><form method="post" action="/chat">{csrf}
<textarea name="message" required placeholder="Ask Blue something"></textarea><button>Send</button></form></section>
<section><h2>Remember</h2><form method="post" action="/memory">{csrf}
<input name="title" required placeholder="Memory title"><textarea name="content" required placeholder="Approved information"></textarea>
<select name="sensitivity"><option>private</option><option>internal</option><option>public</option><option>restricted</option></select>
<button>Save memory</button></form><ul>{memory_rows}</ul></section>
<section><h2>Projects</h2><form method="post" action="/project">{csrf}
<input name="name" required placeholder="Project name"><textarea name="description" placeholder="Description"></textarea>
<button>Create project</button></form><ul>{project_rows}</ul></section>
<section><h2>Open tasks</h2><form method="post" action="/task">{csrf}
<select name="project_id" required><option value="">Choose project</option>{project_options}</select>
<input name="title" required placeholder="Task title"><textarea name="details" placeholder="Details"></textarea>
<select name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select>
<button>Add task</button></form><ul>{task_rows}</ul></section>
<section><h2>Pending approvals</h2><ul>{approval_rows}</ul></section>
<section><h2>Named conversations</h2><form method="post" action="/conversation">{csrf}
<input name="title" required placeholder="Conversation title"><button>Create conversation</button></form>
<ul>{conversation_rows}</ul></section>
<section><h2>Evidence sources</h2><ul>{source_rows}</ul></section>
<section><h2>Execution receipts</h2><ul>{receipt_rows}</ul></section>
<section><h2>Project workspaces</h2><ul>{workspace_rows}</ul></section>
<section><h2>Proposed file changes</h2><ul>{change_rows}</ul></section>
<section><h2>Blue Forge artifacts</h2><ul>{artifact_rows}</ul></section>
<section><h2>Blue Forge bundles</h2><ul>{bundle_rows}</ul></section>
<section><h2>Bounded build and test runs</h2><ul>{run_rows}</ul></section>
<section class="wide"><h2>Blue Academy</h2><ul>{academy_rows}</ul></section>
<section class="wide"><h2>Academy lessons</h2><ul>{lesson_rows}</ul></section>
<section><h2>Academy assessments</h2><ul>{assessment_rows}</ul></section>
<section><h2>Assessment submissions</h2><ul>{submission_rows}</ul></section>
</main></body></html>"""


class BlueDashboardServer(HTTPServer):
    core: BlueCore
    token: str


def create_dashboard_server(
    core: BlueCore,
    host: str = "127.0.0.1",
    port: int = 8765,
    *,
    token: str | None = None,
) -> BlueDashboardServer:
    resolved_host = "127.0.0.1" if host == "localhost" else host
    try:
        address = ipaddress.ip_address(resolved_host)
    except ValueError as exc:
        raise ValueError("Dashboard host must be a loopback IP address.") from exc
    if not address.is_loopback:
        raise ValueError("Phase 1.2 dashboard may only bind to a loopback address.")

    class Handler(BaseHTTPRequestHandler):
        server: BlueDashboardServer

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _security_headers(self) -> None:
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")

        def _authorized(self) -> bool:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            value = cookie.get("blue_session")
            return value is not None and secrets.compare_digest(
                value.value, self.server.token
            )

        def _redirect(self, location: str = "/") -> None:
            self.send_response(303)
            self._security_headers()
            self.send_header("Location", location)
            self.end_headers()

        def _forbidden(self) -> None:
            body = b"Forbidden"
            self.send_response(403)
            self._security_headers()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            if parsed.path == "/login":
                supplied = params.get("token", [""])[0]
                if not secrets.compare_digest(supplied, self.server.token):
                    self._forbidden()
                    return
                self.send_response(303)
                self._security_headers()
                self.send_header(
                    "Set-Cookie",
                    f"blue_session={self.server.token}; HttpOnly; SameSite=Strict; Path=/",
                )
                self.send_header("Location", "/")
                self.end_headers()
                return
            if not self._authorized():
                self._forbidden()
                return
            if parsed.path != "/":
                self.send_error(404)
                return
            query = params.get("q", [""])[0].strip()
            body = render_dashboard(self.server.core, self.server.token, query).encode(
                "utf-8"
            )
            self.send_response(200)
            self._security_headers()
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self) -> None:
            if not self._authorized():
                self._forbidden()
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                self.send_error(413)
                return
            form = parse_qs(self.rfile.read(length).decode("utf-8"))
            csrf = form.get("csrf", [""])[0]
            if not secrets.compare_digest(csrf, self.server.token):
                self._forbidden()
                return
            value = lambda name, default="": form.get(name, [default])[0].strip()
            try:
                if self.path == "/memory":
                    self.server.core.remember(
                        value("title"),
                        value("content"),
                        sensitivity=value("sensitivity", "private"),
                    )
                elif self.path == "/project":
                    self.server.core.create_project(
                        value("name"), value("description")
                    )
                elif self.path == "/task":
                    self.server.core.create_task(
                        value("project_id"),
                        value("title"),
                        value("details"),
                        value("priority", "normal"),
                    )
                elif self.path == "/task/complete":
                    self.server.core.complete_task(value("task_id"))
                elif self.path == "/approval/decide":
                    self.server.core.decide_approval(
                        value("approval_id"), value("decision")
                    )
                elif self.path == "/chat":
                    self.server.core.chat(value("message"))
                elif self.path == "/conversation":
                    self.server.core.create_conversation(value("title"))
                elif self.path == "/change/rollback-request":
                    self.server.core.request_change_rollback(value("change_id"))
                elif self.path == "/change/rollback":
                    self.server.core.rollback_change(value("change_id"))
                else:
                    self.send_error(404)
                    return
            except (RuntimeError, ValueError) as exc:
                self._redirect(f"/?error={quote(str(exc))}")
                return
            self._redirect("/")

    server = BlueDashboardServer((resolved_host, port), Handler)
    server.core = core
    server.token = token or secrets.token_urlsafe(32)
    return server


def serve_dashboard(core: BlueCore, host: str = "127.0.0.1", port: int = 8765) -> None:
    server = create_dashboard_server(core, host, port)
    actual_port = server.server_address[1]
    print("Project Blue dashboard is running locally.")
    print(f"Open: http://127.0.0.1:{actual_port}/login?token={server.token}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
    finally:
        server.server_close()
