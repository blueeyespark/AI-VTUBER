from __future__ import annotations

import argparse
import getpass
import json
import sys
from pathlib import Path

from project_blue import __version__
from project_blue.config import default_home
from project_blue.core import BlueCore
from project_blue.dashboard import serve_dashboard
from project_blue.providers import ProviderError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="blue", description="Project Blue Phase 1 local core"
    )
    parser.add_argument("--home", type=Path, default=default_home())
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="Initialize Blue's local identity and database")
    sub.add_parser("status", help="Show current local status")
    sub.add_parser("constitution", help="Display the active Constitution")
    sub.add_parser("doctor", help="Verify identity, storage, and audit integrity")
    sub.add_parser("shell", help="Start an interactive local Blue session")

    activate = sub.add_parser(
        "activate", help="Talk, learn, and make in a persistent Blue session"
    )
    activate.add_argument("--session", default="Active Blue Session")

    appear = sub.add_parser(
        "appear", help="Open Blue as a visible desktop companion"
    )
    appear.add_argument("--session", default="Blue Desktop")

    dashboard = sub.add_parser("dashboard", help="Run the secure local dashboard")
    dashboard.add_argument("--host", default="127.0.0.1")
    dashboard.add_argument("--port", type=int, default=8765)

    chat = sub.add_parser("chat", help="Send a message through the active provider")
    chat.add_argument("message")

    remember = sub.add_parser("remember", help="Store an approved memory")
    remember.add_argument("title")
    remember.add_argument("content")
    remember.add_argument(
        "--sensitivity",
        choices=["public", "internal", "private", "restricted"],
        default="private",
    )

    recall = sub.add_parser("recall", help="Search approved memories")
    recall.add_argument("query")
    recall.add_argument("--limit", type=int, default=10)

    memories = sub.add_parser("memories", help="List recent memories")
    memories.add_argument("--limit", type=int, default=20)

    forget = sub.add_parser("forget", help="Delete a memory by ID")
    forget.add_argument("memory_id")

    memory_update = sub.add_parser("memory-update", help="Update a memory by ID")
    memory_update.add_argument("memory_id")
    memory_update.add_argument("title")
    memory_update.add_argument("content")
    memory_update.add_argument(
        "--sensitivity",
        choices=["public", "internal", "private", "restricted"],
        default="private",
    )
    memory_update.add_argument("--retention", default="until_deleted")

    memory_import = sub.add_parser(
        "memory-import", help="Import memories from a JSON file"
    )
    memory_import.add_argument("source", type=Path)

    audit = sub.add_parser("audit", help="Show recent audit events")
    audit.add_argument("--limit", type=int, default=20)

    evaluate = sub.add_parser("evaluate", help="Evaluate a proposed action")
    evaluate.add_argument("action_type")
    evaluate.add_argument("content")

    search = sub.add_parser(
        "search", help="Search memories, projects, and tasks"
    )
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=20)

    sub.add_parser("provider-check", help="Check the configured model provider")

    model_setup = sub.add_parser(
        "model-setup", help="Configure an installed local Ollama model"
    )
    model_setup.add_argument("--model")

    openai_setup = sub.add_parser(
        "openai-setup", help="Configure OpenAI as Blue's chat provider"
    )
    openai_setup.add_argument("--model")

    source_add = sub.add_parser("source-add", help="Add a UTF-8 text source")
    source_add.add_argument("source", type=Path)
    source_add.add_argument("--title")

    sub.add_parser("sources", help="List stored sources")

    source_show = sub.add_parser("source-show", help="Display a stored source")
    source_show.add_argument("source_id")

    source_remove = sub.add_parser("source-remove", help="Remove a stored source")
    source_remove.add_argument("source_id")

    memory_cite = sub.add_parser("memory-cite", help="Link a memory to a source")
    memory_cite.add_argument("memory_id")
    memory_cite.add_argument("source_id")
    memory_cite.add_argument("--locator", default="")
    memory_cite.add_argument("--note", default="")

    citations = sub.add_parser("citations", help="List source citations")
    citations.add_argument("--memory")

    conversation_create = sub.add_parser(
        "conversation-create", help="Create a named conversation workspace"
    )
    conversation_create.add_argument("title")

    sub.add_parser("conversations", help="List named conversations")

    conversation_show = sub.add_parser(
        "conversation-show", help="Show a named conversation"
    )
    conversation_show.add_argument("conversation")

    conversation_delete = sub.add_parser(
        "conversation-delete", help="Delete a named conversation"
    )
    conversation_delete.add_argument("conversation")
    conversation_delete.add_argument("--confirm", action="store_true")

    conversation_chat = sub.add_parser(
        "conversation-chat", help="Chat inside a named conversation"
    )
    conversation_chat.add_argument("conversation")
    conversation_chat.add_argument("message")

    config = sub.add_parser("config", help="Update local configuration")
    config.add_argument(
        "key",
        choices=[
            "provider",
            "model",
            "openai_model",
            "ollama_url",
            "prefer_local_provider",
            "local_ram_gb",
            "ollama_context_tokens",
            "ollama_gpu_layers",
            "save_conversations",
        ],
    )
    config.add_argument("value")

    export = sub.add_parser("export", help="Export a readable JSON snapshot")
    export.add_argument("destination", type=Path)

    backup = sub.add_parser("backup", help="Copy the local SQLite database")
    backup.add_argument("destination", type=Path)

    verify_backup = sub.add_parser(
        "verify-backup", help="Verify a backup checksum and SQLite integrity"
    )
    verify_backup.add_argument("backup", type=Path)

    project_create = sub.add_parser("project-create", help="Create a project")
    project_create.add_argument("name")
    project_create.add_argument("--description", default="")

    projects = sub.add_parser("projects", help="List projects")
    projects.add_argument("--status", choices=["active", "paused", "archived"])

    project_show = sub.add_parser("project-show", help="Show a project and tasks")
    project_show.add_argument("project")

    task_add = sub.add_parser("task-add", help="Add a task to a project")
    task_add.add_argument("project")
    task_add.add_argument("title")
    task_add.add_argument("--details", default="")
    task_add.add_argument(
        "--priority", choices=["low", "normal", "high", "urgent"], default="normal"
    )

    tasks = sub.add_parser("tasks", help="List project tasks")
    tasks.add_argument("--project")
    tasks.add_argument("--status", choices=["open", "completed"])

    task_done = sub.add_parser("task-done", help="Complete a task")
    task_done.add_argument("task_id")

    approval_request = sub.add_parser(
        "approval-request", help="Create an accountable approval record"
    )
    approval_request.add_argument("action_type")
    approval_request.add_argument("summary")
    approval_request.add_argument("--payload", default="{}")
    approval_request.add_argument("--hours", type=int, default=24)
    approval_request.add_argument("--quorum", type=int, default=1)

    approvals = sub.add_parser("approvals", help="List approval records")
    approvals.add_argument("--status", choices=["pending", "approved", "denied"])
    approvals.add_argument("--limit", type=int, default=20)

    approval_decide = sub.add_parser(
        "approval-decide", help="Approve or deny a pending request"
    )
    approval_decide.add_argument("approval_id")
    approval_decide.add_argument("decision", choices=["approved", "denied"])
    approval_decide.add_argument("--note", default="")

    approval_vote = sub.add_parser(
        "approval-vote", help="Cast one principal's approval vote"
    )
    approval_vote.add_argument("approval_id")
    approval_vote.add_argument("principal")
    approval_vote.add_argument("decision", choices=["approved", "denied"])
    approval_vote.add_argument("--note", default="")

    approval_receipt = sub.add_parser(
        "approval-receipt", help="Record what happened after an approval"
    )
    approval_receipt.add_argument("approval_id")
    approval_receipt.add_argument(
        "outcome", choices=["succeeded", "failed", "cancelled"]
    )
    approval_receipt.add_argument("details")
    approval_receipt.add_argument("--executor", default="creator")

    receipts = sub.add_parser("receipts", help="List execution receipts")
    receipts.add_argument("--approval")
    receipts.add_argument("--limit", type=int, default=20)

    workspace_add = sub.add_parser(
        "workspace-add", help="Register a project directory in read-only mode"
    )
    workspace_add.add_argument("name")
    workspace_add.add_argument("path", type=Path)

    sub.add_parser("workspaces", help="List registered project workspaces")

    workspace_index = sub.add_parser(
        "workspace-index", help="Read and index supported workspace files"
    )
    workspace_index.add_argument("workspace")

    workspace_files = sub.add_parser(
        "workspace-files", help="List indexed files in a workspace"
    )
    workspace_files.add_argument("workspace")
    workspace_files.add_argument("--limit", type=int, default=100)

    workspace_policy = sub.add_parser(
        "workspace-policy", help="Show workspace indexing and proposal policy"
    )
    workspace_policy.add_argument("workspace")

    workspace_policy_set = sub.add_parser(
        "workspace-policy-set", help="Update bounded workspace policy"
    )
    workspace_policy_set.add_argument("workspace")
    workspace_policy_set.add_argument("--max-file-kb", type=int, required=True)
    workspace_policy_set.add_argument("--max-total-mb", type=int, required=True)
    workspace_policy_set.add_argument(
        "--allow-new-files", choices=["true", "false"], required=True
    )
    workspace_policy_set.add_argument(
        "--proposal-hours", type=int, default=168
    )

    workspace_freshness = sub.add_parser(
        "workspace-freshness", help="Compare indexed hashes with current files"
    )
    workspace_freshness.add_argument("workspace")

    workspace_access = sub.add_parser(
        "workspace-access", help="List role-scoped workspace access"
    )
    workspace_access.add_argument("workspace")

    workspace_grant = sub.add_parser(
        "workspace-grant", help="Grant or update workspace access"
    )
    workspace_grant.add_argument("workspace")
    workspace_grant.add_argument("principal")
    workspace_grant.add_argument(
        "role", choices=["viewer", "proposer", "maintainer"]
    )

    workspace_revoke = sub.add_parser(
        "workspace-revoke", help="Revoke non-creator workspace access"
    )
    workspace_revoke.add_argument("workspace")
    workspace_revoke.add_argument("principal")

    change_propose = sub.add_parser(
        "change-propose", help="Create a diff and approval request without writing"
    )
    change_propose.add_argument("workspace")
    change_propose.add_argument("relative_path")
    change_propose.add_argument("proposed_file", type=Path)

    changes = sub.add_parser("changes", help="List proposed file changes")
    changes.add_argument(
        "--status",
        choices=["proposed", "applied", "rejected", "expired", "rolled_back"],
    )
    changes.add_argument("--limit", type=int, default=20)

    change_show = sub.add_parser("change-show", help="Display a proposed diff")
    change_show.add_argument("change_id")

    change_apply = sub.add_parser(
        "change-apply", help="Apply an approved, unchanged file proposal"
    )
    change_apply.add_argument("change_id")

    change_reject = sub.add_parser(
        "change-reject", help="Reject a proposed change and deny its approval"
    )
    change_reject.add_argument("change_id")
    change_reject.add_argument("reason")

    rollback_request = sub.add_parser(
        "change-rollback-request", help="Request approval to rollback a change"
    )
    rollback_request.add_argument("change_id")

    rollback_apply = sub.add_parser(
        "change-rollback", help="Rollback a change after explicit approval"
    )
    rollback_apply.add_argument("change_id")

    proposal_export = sub.add_parser(
        "proposal-export", help="Export an HMAC-signed proposal bundle"
    )
    proposal_export.add_argument("change_id")
    proposal_export.add_argument("destination", type=Path)

    proposal_verify = sub.add_parser(
        "proposal-verify", help="Verify a local signed proposal bundle"
    )
    proposal_verify.add_argument("bundle", type=Path)

    restore_drill = sub.add_parser(
        "restore-drill", help="Verify and restore a backup in temporary isolation"
    )
    restore_drill.add_argument("backup", type=Path)

    backup_schedule = sub.add_parser(
        "backup-schedule", help="Set backup verification cadence"
    )
    backup_schedule.add_argument("hours", type=int)

    sub.add_parser("maintenance-status", help="Show backup verification cadence")

    maintenance_run = sub.add_parser(
        "maintenance-run", help="Verify every database backup in a directory"
    )
    maintenance_run.add_argument("backup_directory", type=Path)
    maintenance_run.add_argument("--force", action="store_true")

    principal_create = sub.add_parser(
        "principal-create", help="Create a password-authenticated principal"
    )
    principal_create.add_argument("name")
    principal_create.add_argument("--display-name")

    sub.add_parser("principals", help="List principals without credential data")

    vault_set = sub.add_parser(
        "vault-set", help="Store a Windows DPAPI-protected secret"
    )
    vault_set.add_argument("name")
    vault_set.add_argument("principal")

    vault_get = sub.add_parser(
        "vault-get", help="Retrieve an owned protected secret"
    )
    vault_get.add_argument("name")
    vault_get.add_argument("principal")

    vault_delete = sub.add_parser(
        "vault-delete", help="Delete an owned protected secret"
    )
    vault_delete.add_argument("name")
    vault_delete.add_argument("principal")

    release_create = sub.add_parser(
        "release-create", help="Create an HMAC-signed release manifest"
    )
    release_create.add_argument("application_root", type=Path)
    release_create.add_argument("destination", type=Path)

    release_verify = sub.add_parser(
        "release-verify", help="Verify release signature and installed files"
    )
    release_verify.add_argument("manifest", type=Path)
    release_verify.add_argument("application_root", type=Path)

    onboard = sub.add_parser(
        "onboard", help="Configure identity, creator authentication, and backups"
    )
    onboard.add_argument("--identity", default="Blue")
    onboard.add_argument("--backup-hours", type=int, default=24)

    forge_artifact = sub.add_parser(
        "forge-artifact", help="Create a provenance-tracked draft artifact"
    )
    forge_artifact.add_argument("title")
    forge_artifact.add_argument(
        "kind", choices=["code", "document", "website", "lesson", "design"]
    )
    forge_artifact.add_argument("content_file", type=Path)
    forge_artifact.add_argument("--source", action="append", default=[])

    forge_template = sub.add_parser(
        "forge-template", help="Create a template artifact and file proposal"
    )
    forge_template.add_argument("workspace")
    forge_template.add_argument(
        "template", choices=["python_cli", "static_page", "markdown_doc"]
    )
    forge_template.add_argument("relative_path")

    sub.add_parser("forge-artifacts", help="List Forge draft artifacts")

    forge_bundle = sub.add_parser(
        "forge-bundle",
        help="Create a multi-file artifact bundle with approval-gated proposals",
    )
    forge_bundle.add_argument("workspace")
    forge_bundle.add_argument("template", choices=["python_starter"])
    forge_bundle.add_argument("name")

    sub.add_parser("forge-bundles", help="List multi-file Forge bundles")

    artifact_release_request = sub.add_parser(
        "forge-release-request", help="Request approval to release an artifact"
    )
    artifact_release_request.add_argument("artifact_id")
    artifact_release_request.add_argument("--quorum", type=int, default=1)

    artifact_release = sub.add_parser(
        "forge-release", help="Release an approved Forge artifact"
    )
    artifact_release.add_argument("artifact_id")

    artifact_verify = sub.add_parser(
        "forge-verify", help="Verify a released artifact signature and content"
    )
    artifact_verify.add_argument("artifact_id")

    run_request = sub.add_parser(
        "run-request", help="Request an allowlisted build or test run"
    )
    run_request.add_argument("workspace")
    run_request.add_argument(
        "runner", choices=["python_compile", "python_unittest"]
    )

    run_execute = sub.add_parser(
        "run-execute", help="Execute an approved allowlisted run"
    )
    run_execute.add_argument("run_id")

    run_verify = sub.add_parser(
        "run-verify", help="Verify a completed runner result attestation"
    )
    run_verify.add_argument("run_id")

    runner_policy = sub.add_parser(
        "runner-policy", help="Show a workspace's allowlisted runner policy"
    )
    runner_policy.add_argument("workspace")

    runner_policy_set = sub.add_parser(
        "runner-policy-set", help="Enable or disable an allowlisted runner"
    )
    runner_policy_set.add_argument("workspace")
    runner_policy_set.add_argument(
        "runner", choices=["python_compile", "python_unittest"]
    )
    runner_policy_set.add_argument("enabled", choices=["true", "false"])

    sub.add_parser("runs", help="List Forge execution runs")

    academy_ask = sub.add_parser(
        "academy-ask", help="Answer from stored evidence with citations"
    )
    academy_ask.add_argument("question")

    sub.add_parser("academy-history", help="List prior Academy answers")

    academy_lesson = sub.add_parser(
        "academy-lesson", help="Create a source-backed lesson"
    )
    academy_lesson.add_argument("topic")

    sub.add_parser("academy-lessons", help="List source-backed lessons")

    academy_assessment = sub.add_parser(
        "academy-assessment",
        help="Create a human-reviewed assessment from a cited lesson",
    )
    academy_assessment.add_argument("lesson_id")

    sub.add_parser("academy-assessments", help="List Academy assessments")

    academy_submit = sub.add_parser(
        "academy-submit",
        help="Submit a JSON array of answers for human review",
    )
    academy_submit.add_argument("assessment_id")
    academy_submit.add_argument("principal")
    academy_submit.add_argument("answers_json_file", type=Path)

    academy_submissions = sub.add_parser(
        "academy-submissions", help="List assessment submissions"
    )
    academy_submissions.add_argument("--assessment")

    sub.add_parser("capabilities", help="Show the versioned Blue Genome module map")
    sub.add_parser(
        "research-catalog", help="Show primary sources behind Blue's architecture"
    )

    lab_capture = sub.add_parser(
        "lab-capture",
        help="Capture an idea, hypothesis, experiment, or finding",
    )
    lab_capture.add_argument("title")
    lab_capture.add_argument(
        "kind", choices=["idea", "hypothesis", "experiment", "finding"]
    )
    lab_capture.add_argument("content")
    lab_capture.add_argument("--assumption", action="append", default=[])
    lab_capture.add_argument("--provenance", default="creator")
    lab_capture.add_argument("--confidence", type=float, default=0.0)

    lab_items = sub.add_parser("lab-items", help="List Laboratory records")
    lab_items.add_argument(
        "--kind", choices=["idea", "hypothesis", "experiment", "finding"]
    )
    lab_items.add_argument(
        "--status",
        choices=["captured", "researching", "testing", "reviewed", "archived"],
    )
    lab_items.add_argument("--limit", type=int, default=100)

    lab_show = sub.add_parser("lab-show", help="Show one Laboratory record")
    lab_show.add_argument("item_id")

    lab_evidence = sub.add_parser(
        "lab-evidence", help="Link a stored source to a Laboratory record"
    )
    lab_evidence.add_argument("item_id")
    lab_evidence.add_argument("source_id")
    lab_evidence.add_argument(
        "relationship", choices=["supports", "challenges", "context"]
    )
    lab_evidence.add_argument("--note", default="")

    history = sub.add_parser("history", help="Show saved conversation history")
    history.add_argument("--limit", type=int, default=20)

    clear_history = sub.add_parser(
        "history-clear", help="Delete saved conversation history"
    )
    clear_history.add_argument("--confirm", action="store_true")
    return parser


def _print_memories(rows: list[dict[str, object]]) -> None:
    if not rows:
        print("No matching memories.")
        return
    for row in rows:
        print(f"{row['id']}  [{row['sensitivity']}]  {row['title']}")
        print(f"  {row['content']}")


def _print_projects(rows: list[dict[str, object]]) -> None:
    if not rows:
        print("No projects.")
        return
    for row in rows:
        print(f"{row['id']}  [{row['status']}]  {row['name']}")
        if row["description"]:
            print(f"  {row['description']}")


def _print_tasks(rows: list[dict[str, object]]) -> None:
    if not rows:
        print("No tasks.")
        return
    for row in rows:
        marker = "x" if row["status"] == "completed" else " "
        print(
            f"{row['id']}  [{marker}] [{row['priority']}] "
            f"{row['title']}  project={row['project_id']}"
        )
        if row["details"]:
            print(f"  {row['details']}")


def _interactive_shell(
    core: BlueCore, conversation: str | None = None
) -> None:
    core.ensure_initialized()
    if conversation:
        activation = core.activate_session(conversation)
        conversation = activation["conversation_id"]
        print(json.dumps(activation, indent=2))
    print("Blue is active. Type /help for commands or /quit to leave.")
    while True:
        try:
            message = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not message:
            continue
        if message in {"/quit", "/exit"}:
            return
        if message == "/help":
            print(
                "/remember TITLE | CONTENT\n"
                "/recall QUERY\n"
                "/learn PATH | OPTIONAL TITLE\n"
                "/lesson TOPIC\n"
                "/academy QUESTION\n"
                "/make WORKSPACE | TEMPLATE | RELATIVE_PATH\n"
                "/projects\n/tasks\n/doctor\n/quit\n"
                "Any other text is sent to Blue."
            )
            continue
        if message.startswith("/remember "):
            value = message.removeprefix("/remember ")
            if "|" not in value:
                print("Use: /remember TITLE | CONTENT")
                continue
            title, content = (part.strip() for part in value.split("|", 1))
            print(f"Saved {core.remember(title, content)}")
            continue
        if message.startswith("/recall "):
            _print_memories(
                core.storage.search_memories(message.removeprefix("/recall "), 10)
            )
            continue
        if message.startswith("/learn "):
            value = message.removeprefix("/learn ")
            path_text, separator, title = value.partition("|")
            source_id = core.add_source(
                Path(path_text.strip()), title.strip() if separator else None
            )
            print(f"blue> Source learned with provenance: {source_id}")
            continue
        if message.startswith("/lesson "):
            result = core.academy_create_lesson(
                message.removeprefix("/lesson ").strip()
            )
            print(f"blue> Cited lesson created: {result['lesson_id']}")
            continue
        if message.startswith("/academy "):
            result = core.academy_ask(
                message.removeprefix("/academy ").strip()
            )
            print(f"blue> {result['answer']}")
            continue
        if message.startswith("/make "):
            values = [
                value.strip()
                for value in message.removeprefix("/make ").split("|")
            ]
            if len(values) != 3:
                print("Use: /make WORKSPACE | TEMPLATE | RELATIVE_PATH")
                continue
            result = core.forge_template(values[0], values[1], values[2])
            print(
                "blue> Draft created; approval required before any project write.\n"
                + json.dumps(result, indent=2)
            )
            continue
        if message == "/projects":
            _print_projects(core.storage.list_projects())
            continue
        if message == "/tasks":
            _print_tasks(core.storage.list_tasks(status="open"))
            continue
        if message == "/doctor":
            print(json.dumps(core.doctor(), indent=2))
            continue
        if conversation:
            response, decision = core.conversation_chat(conversation, message)
        else:
            response, decision = core.chat(message)
        print(f"blue> {response}")
        print(f"policy> {decision.decision.value} ({decision.rule})")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    core = BlueCore(args.home)
    try:
        if args.command == "init":
            core.initialize()
            print(f"Blue initialized at {core.home}")
            print(f"Constitution SHA-256: {core.constitution.fingerprint}")
        elif args.command == "status":
            status = core.doctor()
            print(json.dumps(status, indent=2))
        elif args.command == "constitution":
            print(core.constitution.format_text())
        elif args.command == "doctor":
            report = core.doctor()
            print(json.dumps(report, indent=2))
            return 0 if all(
                [
                    report["database_exists"],
                    report["constitution_match"],
                    report["audit_chain_ok"],
                ]
            ) else 1
        elif args.command == "shell":
            _interactive_shell(core)
        elif args.command == "activate":
            _interactive_shell(core, args.session)
        elif args.command == "appear":
            from project_blue.desktop import run_desktop

            run_desktop(core, args.session)
        elif args.command == "dashboard":
            core.ensure_initialized()
            serve_dashboard(core, args.host, args.port)
        elif args.command == "chat":
            response, decision = core.chat(args.message)
            print(response)
            print(f"\nPolicy: {decision.decision.value} ({decision.rule})")
        elif args.command == "remember":
            memory_id = core.remember(
                args.title, args.content, sensitivity=args.sensitivity
            )
            print(f"Memory saved: {memory_id}")
        elif args.command == "recall":
            core.ensure_initialized()
            _print_memories(core.storage.search_memories(args.query, args.limit))
        elif args.command == "memories":
            core.ensure_initialized()
            _print_memories(core.storage.list_memories(args.limit))
        elif args.command == "forget":
            print("Memory deleted." if core.forget(args.memory_id) else "Memory not found.")
        elif args.command == "memory-update":
            changed = core.update_memory(
                args.memory_id,
                title=args.title,
                content=args.content,
                sensitivity=args.sensitivity,
                retention=args.retention,
            )
            print("Memory updated." if changed else "Memory not found.")
        elif args.command == "memory-import":
            count, _ = core.import_memories(args.source)
            print(f"Imported {count} memory record(s).")
        elif args.command == "audit":
            core.ensure_initialized()
            for event in core.storage.recent_audit(args.limit):
                print(
                    f"{event['sequence']:>4} {event['occurred_at']} "
                    f"{event['action']} -> {event['result']}"
                )
        elif args.command == "evaluate":
            result = core.evaluate(args.content, args.action_type)
            print(
                json.dumps(
                    {
                        "decision": result.decision.value,
                        "rule": result.rule,
                        "reason": result.reason,
                    },
                    indent=2,
                )
            )
        elif args.command == "search":
            core.ensure_initialized()
            rows = core.storage.unified_search(args.query, args.limit)
            if not rows:
                print("No matching information.")
            for row in rows:
                print(f"{row['type']}: {row['title']}  ({row['id']})")
                if row["body"]:
                    print(f"  {row['body']}")
        elif args.command == "provider-check":
            report = core.provider_status()
            print(json.dumps(report, indent=2))
            return 0 if report["available"] else 1
        elif args.command == "model-setup":
            report = core.configure_local_model(args.model)
            print(json.dumps(report, indent=2))
            return 0 if report["configured"] else 1
        elif args.command == "openai-setup":
            report = core.configure_openai_model(args.model)
            print(json.dumps(report, indent=2))
            return 0 if report["available"] else 1
        elif args.command == "source-add":
            print(f"Source added: {core.add_source(args.source, args.title)}")
        elif args.command == "sources":
            core.ensure_initialized()
            rows = core.storage.list_sources()
            if not rows:
                print("No sources.")
            for row in rows:
                print(
                    f"{row['id']}  {row['title']}  "
                    f"[{row['media_type']}] sha256={row['sha256']}"
                )
        elif args.command == "source-show":
            core.ensure_initialized()
            source = core.storage.get_source(args.source_id)
            if source is None:
                raise ValueError(f"Source not found: {args.source_id}")
            print(f"{source['title']}\nSHA-256: {source['sha256']}\n")
            print(source["content"])
        elif args.command == "source-remove":
            print(
                "Source removed."
                if core.remove_source(args.source_id)
                else "Source not found."
            )
        elif args.command == "memory-cite":
            citation_id = core.cite_memory(
                args.memory_id,
                args.source_id,
                locator=args.locator,
                note=args.note,
            )
            print(f"Citation created: {citation_id}")
        elif args.command == "citations":
            core.ensure_initialized()
            rows = core.storage.list_citations(args.memory)
            if not rows:
                print("No citations.")
            for row in rows:
                print(
                    f"{row['id']}  memory={row['memory_id']}  "
                    f"source={row['source_title']}  locator={row['locator']}"
                )
        elif args.command == "conversation-create":
            print(f"Conversation created: {core.create_conversation(args.title)}")
        elif args.command == "conversations":
            core.ensure_initialized()
            rows = core.storage.list_conversations()
            if not rows:
                print("No named conversations.")
            for row in rows:
                print(f"{row['id']}  {row['title']}  updated={row['updated_at']}")
        elif args.command == "conversation-show":
            core.ensure_initialized()
            conversation = core.storage.get_conversation(args.conversation)
            if conversation is None:
                raise ValueError(f"Conversation not found: {args.conversation}")
            print(f"# {conversation['title']}")
            for row in core.storage.conversation_entries(conversation["id"]):
                print(f"{row['role']}> {row['content']}")
        elif args.command == "conversation-delete":
            if not args.confirm:
                raise ValueError("Use --confirm to delete a conversation.")
            deleted = core.delete_conversation(args.conversation)
            print(f"Deleted conversation: {deleted['title']} ({deleted['id']})")
        elif args.command == "conversation-chat":
            response, decision = core.conversation_chat(
                args.conversation, args.message
            )
            print(response)
            print(f"\nPolicy: {decision.decision.value} ({decision.rule})")
        elif args.command == "config":
            core.update_config(args.key, args.value)
            print(f"Updated {args.key}.")
        elif args.command == "export":
            print(f"Exported to {core.export(args.destination).resolve()}")
        elif args.command == "backup":
            print(f"Backup saved to {core.backup(args.destination).resolve()}")
            print(
                "Checksum saved to "
                f"{args.destination.with_suffix(args.destination.suffix + '.sha256').resolve()}"
            )
        elif args.command == "verify-backup":
            report = core.verify_backup(args.backup)
            print(json.dumps(report, indent=2))
            return 0 if report["valid"] else 1
        elif args.command == "project-create":
            project_id = core.create_project(args.name, args.description)
            print(f"Project created: {project_id}")
        elif args.command == "projects":
            core.ensure_initialized()
            _print_projects(core.storage.list_projects(args.status))
        elif args.command == "project-show":
            core.ensure_initialized()
            project = core.storage.get_project(args.project)
            if project is None:
                raise ValueError(f"Project not found: {args.project}")
            _print_projects([project])
            _print_tasks(core.storage.list_tasks(project_id=project["id"]))
        elif args.command == "task-add":
            task_id = core.create_task(
                args.project, args.title, args.details, args.priority
            )
            print(f"Task created: {task_id}")
        elif args.command == "tasks":
            core.ensure_initialized()
            project_id = None
            if args.project:
                project = core.storage.get_project(args.project)
                if project is None:
                    raise ValueError(f"Project not found: {args.project}")
                project_id = project["id"]
            _print_tasks(core.storage.list_tasks(project_id, args.status))
        elif args.command == "task-done":
            print(
                "Task completed."
                if core.complete_task(args.task_id)
                else "Task not found or already completed."
            )
        elif args.command == "approval-request":
            try:
                payload = json.loads(args.payload)
            except json.JSONDecodeError as exc:
                raise ValueError("--payload must be valid JSON.") from exc
            if not isinstance(payload, dict):
                raise ValueError("--payload must be a JSON object.")
            approval_id, policy = core.request_approval(
                args.action_type,
                args.summary,
                payload,
                args.hours,
                args.quorum,
            )
            print(f"Approval requested: {approval_id}")
            print(f"Policy: {policy.decision.value} ({policy.rule})")
        elif args.command == "approvals":
            core.ensure_initialized()
            for row in core.storage.list_approvals(args.status, args.limit):
                print(
                    f"{row['id']}  [{row['status']}] "
                    f"{row['action_type']}: {row['summary']}"
                )
        elif args.command == "approval-decide":
            print(
                f"Approval {args.decision}."
                if core.decide_approval(
                    args.approval_id, args.decision, args.note
                )
                else "Approval not found or already decided."
            )
        elif args.command == "approval-vote":
            print(
                "Vote recorded."
                if core.vote_approval(
                    args.approval_id,
                    args.principal,
                    args.decision,
                    args.note,
                )
                else "Approval is closed or this principal already voted."
            )
        elif args.command == "approval-receipt":
            receipt_id = core.record_execution_receipt(
                args.approval_id,
                args.outcome,
                args.details,
                executor=args.executor,
            )
            print(f"Execution receipt recorded: {receipt_id}")
        elif args.command == "receipts":
            core.ensure_initialized()
            rows = core.storage.list_execution_receipts(
                args.approval, args.limit
            )
            if not rows:
                print("No execution receipts.")
            for row in rows:
                print(
                    f"{row['id']}  approval={row['approval_id']} "
                    f"[{row['outcome']}] {row['details']}"
                )
        elif args.command == "workspace-add":
            workspace_id = core.register_workspace(args.name, args.path)
            print(f"Read-only workspace registered: {workspace_id}")
        elif args.command == "workspaces":
            core.ensure_initialized()
            rows = core.storage.list_workspaces()
            if not rows:
                print("No registered workspaces.")
            for row in rows:
                print(
                    f"{row['id']}  {row['name']}  [{row['mode']}] "
                    f"{row['root_path']}  indexed={row['indexed_at'] or 'never'}"
                )
        elif args.command == "workspace-index":
            print(json.dumps(core.index_workspace(args.workspace), indent=2))
        elif args.command == "workspace-files":
            core.ensure_initialized()
            workspace = core.storage.get_workspace(args.workspace)
            if workspace is None:
                raise ValueError(f"Workspace not found: {args.workspace}")
            rows = core.storage.list_workspace_files(
                workspace["id"], args.limit
            )
            if not rows:
                print("No indexed files.")
            for row in rows:
                print(
                    f"{row['relative_path']}  {row['size']} bytes  "
                    f"sha256={row['sha256']}"
                )
        elif args.command == "workspace-policy":
            print(json.dumps(core.workspace_policy(args.workspace), indent=2))
        elif args.command == "workspace-policy-set":
            policy = core.update_workspace_policy(
                args.workspace,
                max_file_bytes=args.max_file_kb * 1000,
                max_total_bytes=args.max_total_mb * 1_000_000,
                allow_new_files=args.allow_new_files == "true",
                proposal_lifetime_hours=args.proposal_hours,
            )
            print(json.dumps(policy, indent=2))
        elif args.command == "workspace-freshness":
            report = core.workspace_freshness(args.workspace)
            print(json.dumps(report, indent=2))
            return 0 if report["fresh"] else 1
        elif args.command == "workspace-access":
            core.ensure_initialized()
            workspace = core.storage.get_workspace(args.workspace)
            if workspace is None:
                raise ValueError(f"Workspace not found: {args.workspace}")
            rows = core.storage.list_workspace_access(workspace["id"])
            for row in rows:
                print(f"{row['principal']}  {row['role']}  granted={row['granted_at']}")
        elif args.command == "workspace-grant":
            core.grant_workspace_access(
                args.workspace, args.principal, args.role
            )
            print("Workspace access granted.")
        elif args.command == "workspace-revoke":
            print(
                "Workspace access revoked."
                if core.revoke_workspace_access(args.workspace, args.principal)
                else "Access not found or creator access is protected."
            )
        elif args.command == "change-propose":
            change_id, approval_id = core.propose_file_change(
                args.workspace, args.relative_path, args.proposed_file
            )
            print(f"Change proposed: {change_id}")
            print(f"Approval required: {approval_id}")
        elif args.command == "changes":
            core.ensure_initialized()
            rows = core.storage.list_proposed_changes(args.status, args.limit)
            if not rows:
                print("No proposed changes.")
            for row in rows:
                print(
                    f"{row['id']}  [{row['status']}] {row['relative_path']} "
                    f"approval={row['approval_id']}"
                )
        elif args.command == "change-show":
            core.ensure_initialized()
            change = core.storage.get_proposed_change(args.change_id)
            if change is None:
                raise ValueError(f"Proposed change not found: {args.change_id}")
            print(change["unified_diff"])
        elif args.command == "change-apply":
            print(f"Applied approved change to {core.apply_proposed_change(args.change_id)}")
        elif args.command == "change-reject":
            print(
                "Change rejected."
                if core.reject_proposed_change(args.change_id, args.reason)
                else "Change was not pending."
            )
        elif args.command == "change-rollback-request":
            approval_id = core.request_change_rollback(args.change_id)
            print(f"Rollback approval required: {approval_id}")
        elif args.command == "change-rollback":
            print(f"Rolled back change at {core.rollback_change(args.change_id)}")
        elif args.command == "proposal-export":
            print(
                f"Signed proposal saved to "
                f"{core.export_signed_proposal(args.change_id, args.destination).resolve()}"
            )
        elif args.command == "proposal-verify":
            report = core.verify_signed_proposal(args.bundle)
            print(json.dumps(report, indent=2))
            return 0 if report["signature_valid"] else 1
        elif args.command == "restore-drill":
            report = core.restore_drill(args.backup)
            print(json.dumps(report, indent=2))
            return 0 if report["restore_drill"] else 1
        elif args.command == "backup-schedule":
            core.configure_backup_verification_schedule(args.hours)
            print(f"Backup verification cadence set to {args.hours} hour(s).")
        elif args.command == "maintenance-status":
            print(json.dumps(core.backup_maintenance_status(), indent=2))
        elif args.command == "maintenance-run":
            report = core.run_backup_maintenance(
                args.backup_directory, force=args.force
            )
            print(json.dumps(report, indent=2))
            return 0 if not report.get("ran") or report.get("all_valid") else 1
        elif args.command == "principal-create":
            password = getpass.getpass("Password: ")
            confirmation = getpass.getpass("Confirm password: ")
            if password != confirmation:
                raise ValueError("Passwords do not match.")
            core.create_principal(
                args.name, args.display_name or args.name, password
            )
            print("Principal created.")
        elif args.command == "principals":
            core.ensure_initialized()
            for row in core.storage.list_principals():
                print(
                    f"{row['name']}  {row['display_name']} "
                    f"active={bool(row['active'])}"
                )
        elif args.command == "vault-set":
            password = getpass.getpass("Principal password: ")
            value = getpass.getpass("Secret value: ")
            core.vault_set(args.name, value, args.principal, password)
            print("Secret stored with Windows DPAPI protection.")
        elif args.command == "vault-get":
            password = getpass.getpass("Principal password: ")
            print(core.vault_get(args.name, args.principal, password))
        elif args.command == "vault-delete":
            password = getpass.getpass("Principal password: ")
            print(
                "Secret deleted."
                if core.vault_delete(args.name, args.principal, password)
                else "Secret not found."
            )
        elif args.command == "release-create":
            path = core.create_release_manifest(
                args.application_root, args.destination
            )
            print(f"Signed release manifest saved to {path.resolve()}")
        elif args.command == "release-verify":
            report = core.verify_release_manifest(
                args.manifest, args.application_root
            )
            print(json.dumps(report, indent=2))
            return 0 if report["signature_valid"] and report["files_match"] else 1
        elif args.command == "onboard":
            password = getpass.getpass("Create or verify creator password: ")
            confirmation = getpass.getpass("Confirm password: ")
            if password != confirmation:
                raise ValueError("Passwords do not match.")
            print(
                json.dumps(
                    core.onboard(args.identity, password, args.backup_hours),
                    indent=2,
                )
            )
        elif args.command == "forge-artifact":
            artifact_id = core.create_forge_artifact(
                args.title, args.kind, args.content_file, args.source
            )
            print(f"Forge artifact created: {artifact_id}")
        elif args.command == "forge-template":
            result = core.forge_template(
                args.workspace, args.template, args.relative_path
            )
            print(json.dumps(result, indent=2))
        elif args.command == "forge-artifacts":
            core.ensure_initialized()
            rows = core.storage.list_forge_artifacts()
            if not rows:
                print("No Forge artifacts.")
            for row in rows:
                print(
                    f"{row['id']}  [{row['kind']}] [{row['status']}] "
                    f"{row['title']} sha256={row['sha256']}"
                )
        elif args.command == "forge-bundle":
            print(
                json.dumps(
                    core.forge_bundle(
                        args.workspace, args.template, args.name
                    ),
                    indent=2,
                )
            )
        elif args.command == "forge-bundles":
            core.ensure_initialized()
            rows = core.storage.list_forge_bundles()
            if not rows:
                print("No Forge bundles.")
            for row in rows:
                items = core.storage.list_forge_bundle_items(row["id"])
                print(
                    f"{row['id']}  [{row['status']}] {row['name']} "
                    f"template={row['template']} files={len(items)}"
                )
        elif args.command == "forge-release-request":
            approval_id = core.request_artifact_release(
                args.artifact_id, args.quorum
            )
            print(f"Artifact release approval required: {approval_id}")
        elif args.command == "forge-release":
            print(json.dumps(core.release_artifact(args.artifact_id), indent=2))
        elif args.command == "forge-verify":
            report = core.verify_artifact_release(args.artifact_id)
            print(json.dumps(report, indent=2))
            return 0 if report["signature_valid"] and report["content_match"] else 1
        elif args.command == "run-request":
            run_id, approval_id = core.request_execution_run(
                args.workspace, args.runner
            )
            print(f"Run requested: {run_id}")
            print(f"Approval required: {approval_id}")
        elif args.command == "run-execute":
            print(json.dumps(core.execute_run(args.run_id), indent=2))
        elif args.command == "run-verify":
            report = core.verify_execution_run(args.run_id)
            print(json.dumps(report, indent=2))
            return 0 if report["hash_valid"] and report["signature_valid"] else 1
        elif args.command == "runner-policy":
            print(json.dumps(core.runner_policy(args.workspace), indent=2))
        elif args.command == "runner-policy-set":
            core.set_runner_policy(
                args.workspace,
                args.runner,
                args.enabled == "true",
            )
            print("Runner policy updated.")
        elif args.command == "runs":
            core.ensure_initialized()
            rows = core.storage.list_execution_runs()
            if not rows:
                print("No execution runs.")
            for row in rows:
                print(
                    f"{row['id']}  [{row['status']}] {row['runner']} "
                    f"approval={row['approval_id']}"
                )
        elif args.command == "academy-ask":
            print(json.dumps(core.academy_ask(args.question), indent=2))
        elif args.command == "academy-history":
            core.ensure_initialized()
            rows = core.storage.list_academy_answers()
            if not rows:
                print("No Academy answers.")
            for row in rows:
                print(f"{row['id']}  {row['question']}\n{row['answer']}\n")
        elif args.command == "academy-lesson":
            print(json.dumps(core.academy_create_lesson(args.topic), indent=2))
        elif args.command == "academy-lessons":
            core.ensure_initialized()
            rows = core.storage.list_academy_lessons()
            if not rows:
                print("No Academy lessons.")
            for row in rows:
                print(
                    f"{row['id']}  {row['title']} "
                    f"sha256={row['content_sha256']}"
                )
        elif args.command == "academy-assessment":
            print(
                json.dumps(
                    core.academy_create_assessment(args.lesson_id), indent=2
                )
            )
        elif args.command == "academy-assessments":
            core.ensure_initialized()
            rows = core.storage.list_academy_assessments()
            if not rows:
                print("No Academy assessments.")
            for row in rows:
                questions = json.loads(row["questions_json"])
                print(
                    f"{row['id']}  {row['title']} "
                    f"questions={len(questions)} lesson={row['lesson_id']}"
                )
        elif args.command == "academy-submit":
            answers = json.loads(
                args.answers_json_file.read_text(encoding="utf-8")
            )
            if not isinstance(answers, list):
                raise ValueError("Answers file must contain a JSON array.")
            print(
                json.dumps(
                    core.academy_submit_assessment(
                        args.assessment_id, args.principal, answers
                    ),
                    indent=2,
                )
            )
        elif args.command == "academy-submissions":
            core.ensure_initialized()
            rows = core.storage.list_academy_submissions(args.assessment)
            if not rows:
                print("No Academy submissions.")
            for row in rows:
                print(
                    f"{row['id']}  [{row['status']}] "
                    f"principal={row['principal']} "
                    f"assessment={row['assessment_id']}"
                )
        elif args.command == "capabilities":
            print(json.dumps(core.capability_report(), indent=2))
        elif args.command == "research-catalog":
            print(json.dumps(core.research_catalog(), indent=2))
        elif args.command == "lab-capture":
            item_id = core.capture_laboratory_item(
                args.title,
                args.kind,
                args.content,
                assumptions=args.assumption,
                provenance=args.provenance,
                confidence=args.confidence,
            )
            print(f"Laboratory item captured: {item_id}")
        elif args.command == "lab-items":
            core.ensure_initialized()
            rows = core.storage.list_laboratory_items(
                kind=args.kind, status=args.status, limit=args.limit
            )
            if not rows:
                print("No Laboratory items.")
            for row in rows:
                print(
                    f"{row['id']}  [{row['kind']}] [{row['status']}] "
                    f"confidence={row['confidence']:.2f}  {row['title']}"
                )
        elif args.command == "lab-show":
            core.ensure_initialized()
            item = core.storage.get_laboratory_item(args.item_id)
            if item is None:
                raise ValueError(f"Laboratory item not found: {args.item_id}")
            print(json.dumps(item, indent=2))
        elif args.command == "lab-evidence":
            core.link_laboratory_evidence(
                args.item_id, args.source_id, args.relationship, args.note
            )
            print("Laboratory evidence linked.")
        elif args.command == "history":
            core.ensure_initialized()
            rows = core.storage.conversation_history(args.limit)[::-1]
            if not rows:
                print("No saved conversation history.")
            for row in rows:
                print(f"{row['created_at']} {row['role']}> {row['content']}")
        elif args.command == "history-clear":
            core.ensure_initialized()
            if not args.confirm:
                raise ValueError("Use --confirm to delete conversation history.")
            count = core.storage.clear_conversation_history()
            core.storage.append_audit(
                actor="creator",
                action="conversation.clear",
                target="all",
                result="success",
                details={"deleted_messages": count},
            )
            print(f"Deleted {count} conversation message(s).")
        return 0
    except (RuntimeError, ValueError, ProviderError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    finally:
        core.close()
