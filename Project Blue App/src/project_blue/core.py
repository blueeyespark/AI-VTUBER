from __future__ import annotations

import difflib
import hashlib
import hmac
import json
import mimetypes
import os
import re
import shutil
import sqlite3
import secrets
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from importlib.resources import files
from pathlib import Path
from typing import Any

from project_blue.config import BlueConfig, load_config, save_config
from project_blue.constitution import Constitution
from project_blue.policy import Decision, PolicyEngine, PolicyResult
from project_blue.providers import OfflineProvider, OllamaProvider, Provider
from project_blue.storage import BlueStorage, utc_now
from project_blue.windows_security import protect, unprotect


class BlueCore:
    LAB_KINDS = {"idea", "hypothesis", "experiment", "finding"}
    LAB_STATUSES = {"captured", "researching", "testing", "reviewed", "archived"}
    TEXT_EXTENSIONS = {
        ".c",
        ".cfg",
        ".conf",
        ".cpp",
        ".css",
        ".csv",
        ".h",
        ".html",
        ".ini",
        ".java",
        ".js",
        ".json",
        ".kt",
        ".md",
        ".properties",
        ".ps1",
        ".py",
        ".rs",
        ".sh",
        ".toml",
        ".ts",
        ".txt",
        ".xml",
        ".yaml",
        ".yml",
    }
    IGNORED_DIRECTORIES = {
        ".blue",
        ".git",
        ".idea",
        ".venv",
        ".vscode",
        "__pycache__",
        "backups",
        "build",
        "dist",
        "node_modules",
        "target",
    }
    def __init__(self, home: Path):
        self.home = home.resolve()
        self.config = load_config(self.home)
        self.constitution = Constitution.load_embedded()
        self.policy = PolicyEngine()
        self.storage = BlueStorage(self.home / "blue.db")

    def close(self) -> None:
        self.storage.close()

    def initialize(self) -> None:
        self.home.mkdir(parents=True, exist_ok=True)
        self.storage.initialize()
        save_config(self.home, self.config)
        self.storage.set_metadata("identity_name", self.config.identity_name)
        self.storage.set_metadata("constitution_version", self.constitution.version)
        self.storage.set_metadata(
            "constitution_fingerprint", self.constitution.fingerprint
        )
        self.storage.set_metadata("initialized_at", self.storage.get_metadata("initialized_at") or utc_now())
        self._ensure_runtime_secrets_and_defaults()
        self.storage.append_audit(
            actor="system",
            action="initialize",
            target=str(self.home),
            result="success",
            details={"constitution": self.constitution.fingerprint},
        )

    def ensure_initialized(self) -> None:
        self.storage.initialize()
        fingerprint = self.storage.get_metadata("constitution_fingerprint")
        if fingerprint is None:
            self.initialize()
        elif fingerprint != self.constitution.fingerprint:
            raise RuntimeError(
                "Constitution fingerprint mismatch. Stop and review before continuing."
            )
        self._ensure_runtime_secrets_and_defaults()

    def _ensure_runtime_secrets_and_defaults(self) -> None:
        if self.storage.get_metadata("proposal_hmac_key") is None:
            self.storage.set_metadata("proposal_hmac_key", secrets.token_hex(32))
        if self.storage.get_metadata("backup_verification_interval_hours") is None:
            self.storage.set_metadata("backup_verification_interval_hours", "24")
        if self.storage.get_metadata("release_hmac_key") is None:
            self.storage.set_metadata("release_hmac_key", secrets.token_hex(32))
        if self.storage.get_metadata("forge_release_hmac_key") is None:
            self.storage.set_metadata(
                "forge_release_hmac_key", secrets.token_hex(32)
            )
        if self.storage.get_metadata("runner_hmac_key") is None:
            self.storage.set_metadata("runner_hmac_key", secrets.token_hex(32))

    def provider(self) -> Provider:
        if self.config.provider == "offline":
            return OfflineProvider()
        if self.config.provider == "ollama":
            return OllamaProvider(self.config.model, self.config.ollama_url)
        raise RuntimeError(f"Unsupported provider: {self.config.provider}")

    def _chat_context(self, prompt: str) -> list[dict[str, Any]]:
        """Retrieve bounded, ranked context from every learned record type."""
        rows = self.storage.unified_search(
            prompt, limit=max(1, self.config.memory_result_limit)
        )
        return [
            {
                "type": str(row.get("type", "memory")),
                "id": str(row.get("id", "")),
                "title": str(row.get("title", "Untitled")),
                "content": str(row.get("body", row.get("content", "")))[:4000],
            }
            for row in rows
        ]

    @staticmethod
    def _embedded_json(name: str) -> dict[str, Any]:
        path = files("project_blue").joinpath(f"data/{name}")
        return json.loads(path.read_text(encoding="utf-8"))

    def capability_report(self) -> dict[str, Any]:
        registry = self._embedded_json("module_registry.json")
        modules = registry["modules"]
        counts: dict[str, int] = {}
        for module in modules:
            counts[module["status"]] = counts.get(module["status"], 0) + 1
        return {
            "schema": registry["schema"],
            "version": registry["version"],
            "counts": counts,
            "modules": modules,
        }

    def research_catalog(self) -> dict[str, Any]:
        return self._embedded_json("research_catalog.json")

    def capture_laboratory_item(
        self,
        title: str,
        kind: str,
        content: str,
        *,
        assumptions: list[str] | None = None,
        provenance: str = "creator",
        confidence: float = 0.0,
    ) -> str:
        self.ensure_initialized()
        clean_title = title.strip()
        clean_content = content.strip()
        if not clean_title or not clean_content:
            raise ValueError("Laboratory title and content cannot be empty.")
        if kind not in self.LAB_KINDS:
            raise ValueError(
                "Laboratory kind must be idea, hypothesis, experiment, or finding."
            )
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("Confidence must be between 0 and 1.")
        if kind == "finding" and confidence <= 0:
            raise ValueError("A finding needs an explicit non-zero confidence.")
        item_id = self.storage.add_laboratory_item(
            clean_title,
            kind,
            clean_content,
            status="captured",
            confidence=confidence,
            provenance=provenance,
            assumptions=[item.strip() for item in assumptions or [] if item.strip()],
        )
        self.storage.append_audit(
            actor="creator",
            action="laboratory.capture",
            target=item_id,
            result="success",
            details={"kind": kind, "confidence": confidence},
        )
        return item_id

    def link_laboratory_evidence(
        self,
        item_id: str,
        source_id: str,
        relationship: str,
        note: str = "",
    ) -> None:
        self.ensure_initialized()
        if relationship not in {"supports", "challenges", "context"}:
            raise ValueError(
                "Evidence relationship must be supports, challenges, or context."
            )
        if self.storage.get_laboratory_item(item_id) is None:
            raise ValueError(f"Laboratory item not found: {item_id}")
        if self.storage.get_source(source_id) is None:
            raise ValueError(f"Source not found: {source_id}")
        try:
            self.storage.add_laboratory_evidence(
                item_id, source_id, relationship, note
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("That evidence link already exists.") from exc
        self.storage.append_audit(
            actor="creator",
            action="laboratory.evidence",
            target=item_id,
            result="success",
            details={"source_id": source_id, "relationship": relationship},
        )

    def evaluate(self, content: str, action_type: str = "conversation") -> PolicyResult:
        return self.policy.evaluate(content, action_type)

    def chat(self, prompt: str) -> tuple[str, PolicyResult]:
        self.ensure_initialized()
        decision = self.evaluate(prompt)
        if decision.decision is Decision.BLOCK:
            self.storage.append_audit(
                actor="creator",
                action="chat",
                target="blue",
                result="blocked",
                details={"rule": decision.rule},
            )
            return (
                "I’m Blue, an AI. I can’t help with that because it conflicts "
                "with my Constitution and peaceful-purpose rules.",
                decision,
            )
        context = self._chat_context(prompt)
        response = self.provider().generate(prompt, context)
        if self.config.save_conversations:
            self.storage.add_conversation_message(
                "user", prompt, self.config.provider
            )
            self.storage.add_conversation_message(
                "assistant", response, self.config.provider
            )
        self.storage.append_audit(
            actor="creator",
            action="chat",
            target=self.config.provider,
            result="success",
            details={"context_count": len(context), "rule": decision.rule},
        )
        return response, decision

    def remember(
        self,
        title: str,
        content: str,
        *,
        sensitivity: str = "private",
    ) -> str:
        self.ensure_initialized()
        memory_id = self.storage.add_memory(
            title, content, sensitivity=sensitivity
        )
        self.storage.append_audit(
            actor="creator",
            action="memory.create",
            target=memory_id,
            result="success",
            details={"title": title, "sensitivity": sensitivity},
        )
        return memory_id

    def forget(self, memory_id: str) -> bool:
        self.ensure_initialized()
        deleted = self.storage.delete_memory(memory_id)
        self.storage.append_audit(
            actor="creator",
            action="memory.delete",
            target=memory_id,
            result="success" if deleted else "not_found",
        )
        return deleted

    def update_memory(
        self,
        memory_id: str,
        *,
        title: str,
        content: str,
        sensitivity: str = "private",
        retention: str = "until_deleted",
    ) -> bool:
        self.ensure_initialized()
        if not title.strip() or not content.strip():
            raise ValueError("Memory title and content cannot be empty.")
        if sensitivity not in {"public", "internal", "private", "restricted"}:
            raise ValueError("Invalid memory sensitivity.")
        if retention not in {
            "session",
            "until_deleted",
            "project_lifetime",
            "permanent",
        }:
            raise ValueError("Invalid memory retention.")
        changed = self.storage.update_memory(
            memory_id,
            title=title,
            content=content,
            sensitivity=sensitivity,
            retention=retention,
        )
        self.storage.append_audit(
            actor="creator",
            action="memory.update",
            target=memory_id,
            result="success" if changed else "not_found",
            details={"sensitivity": sensitivity, "retention": retention},
        )
        return changed

    def import_memories(self, source: Path) -> tuple[int, list[str]]:
        self.ensure_initialized()
        payload = json.loads(source.read_text(encoding="utf-8"))
        items = payload.get("memories") if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            raise ValueError("Import must be a JSON list or contain a 'memories' list.")
        validated: list[dict[str, str]] = []
        allowed_sensitivity = {"public", "internal", "private", "restricted"}
        allowed_retention = {"session", "until_deleted", "project_lifetime", "permanent"}
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValueError(f"Memory at index {index} is not an object.")
            record = {
                "title": str(item.get("title", "")).strip(),
                "content": str(item.get("content", "")).strip(),
                "owner": str(item.get("owner", "creator")).strip(),
                "sensitivity": str(item.get("sensitivity", "private")).strip(),
                "retention": str(item.get("retention", "until_deleted")).strip(),
            }
            if not record["title"] or not record["content"]:
                raise ValueError(f"Memory at index {index} needs title and content.")
            if record["sensitivity"] not in allowed_sensitivity:
                raise ValueError(
                    f"Memory at index {index} has invalid sensitivity."
                )
            if record["retention"] not in allowed_retention:
                raise ValueError(f"Memory at index {index} has invalid retention.")
            validated.append(record)
        imported: list[str] = []
        for record in validated:
            imported.append(
                self.storage.add_memory(
                    record["title"],
                    record["content"],
                    owner=record["owner"],
                    provenance=f"import:{source.name}",
                    sensitivity=record["sensitivity"],
                    retention=record["retention"],
                )
            )
        self.storage.append_audit(
            actor="creator",
            action="memory.import",
            target=str(source.resolve()),
            result="success",
            details={"count": len(imported)},
        )
        return len(imported), imported

    def export(self, destination: Path) -> Path:
        self.ensure_initialized()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(self.storage.export_snapshot(), indent=2) + "\n",
            encoding="utf-8",
        )
        self.storage.append_audit(
            actor="creator",
            action="export",
            target=str(destination),
            result="success",
        )
        return destination

    def backup(self, destination: Path) -> Path:
        self.ensure_initialized()
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.storage.append_audit(
            actor="creator",
            action="backup",
            target=str(destination),
            result="started",
        )
        target = sqlite3.connect(destination)
        try:
            self.storage.connection.backup(target)
        finally:
            target.close()
        digest = hashlib.sha256(destination.read_bytes()).hexdigest()
        destination.with_suffix(destination.suffix + ".sha256").write_text(
            f"{digest}  {destination.name}\n", encoding="utf-8"
        )
        return destination

    def verify_backup(self, backup_path: Path) -> dict[str, Any]:
        checksum_path = backup_path.with_suffix(backup_path.suffix + ".sha256")
        if not backup_path.exists():
            raise ValueError(f"Backup does not exist: {backup_path}")
        if not checksum_path.exists():
            raise ValueError(f"Checksum does not exist: {checksum_path}")
        expected = checksum_path.read_text(encoding="utf-8").split()[0].lower()
        actual = hashlib.sha256(backup_path.read_bytes()).hexdigest()
        connection = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
        try:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            connection.close()
        return {
            "backup": str(backup_path.resolve()),
            "checksum_match": expected == actual,
            "integrity_check": integrity,
            "valid": expected == actual and integrity == "ok",
        }

    def create_project(self, name: str, description: str = "") -> str:
        self.ensure_initialized()
        if not name.strip():
            raise ValueError("Project name cannot be empty.")
        try:
            project_id = self.storage.create_project(name, description)
        except sqlite3.IntegrityError as exc:
            raise ValueError(f"A project named '{name}' already exists.") from exc
        self.storage.append_audit(
            actor="creator",
            action="project.create",
            target=project_id,
            result="success",
            details={"name": name},
        )
        return project_id

    def create_task(
        self,
        project_identifier: str,
        title: str,
        details: str = "",
        priority: str = "normal",
    ) -> str:
        self.ensure_initialized()
        project = self.storage.get_project(project_identifier)
        if project is None:
            raise ValueError(f"Project not found: {project_identifier}")
        if not title.strip():
            raise ValueError("Task title cannot be empty.")
        task_id = self.storage.create_task(
            project["id"], title, details, priority
        )
        self.storage.append_audit(
            actor="creator",
            action="task.create",
            target=task_id,
            result="success",
            details={"project_id": project["id"], "priority": priority},
        )
        return task_id

    def complete_task(self, task_id: str) -> bool:
        self.ensure_initialized()
        completed = self.storage.complete_task(task_id)
        self.storage.append_audit(
            actor="creator",
            action="task.complete",
            target=task_id,
            result="success" if completed else "not_found_or_already_complete",
        )
        return completed

    def request_approval(
        self,
        action_type: str,
        summary: str,
        payload: dict[str, Any] | None = None,
        lifetime_hours: int = 24,
        required_votes: int = 1,
    ) -> tuple[str, PolicyResult]:
        self.ensure_initialized()
        policy = self.evaluate(summary, action_type)
        if policy.decision is Decision.BLOCK:
            self.storage.append_audit(
                actor="creator",
                action="approval.request",
                target=action_type,
                result="blocked",
                details={"rule": policy.rule},
            )
            raise ValueError(f"Request blocked by {policy.rule}: {policy.reason}")
        if not 1 <= required_votes <= 10:
            raise ValueError("Approval quorum must be between 1 and 10.")
        approval_id = self.storage.request_approval(
            action_type, summary, payload, lifetime_hours, required_votes
        )
        self.storage.append_audit(
            actor="creator",
            action="approval.request",
            target=approval_id,
            result="pending",
            details={"action_type": action_type, "rule": policy.rule},
        )
        return approval_id, policy

    def vote_approval(
        self,
        approval_id: str,
        principal: str,
        decision: str,
        note: str = "",
    ) -> bool:
        self.ensure_initialized()
        if self.storage.get_principal(principal) is None and principal != "creator":
            raise ValueError(f"Principal not found: {principal}")
        changed = self.storage.cast_approval_vote(
            approval_id, principal, decision, note
        )
        self.storage.append_audit(
            actor=principal,
            action="approval.vote",
            target=approval_id,
            result=decision if changed else "not_pending_or_duplicate",
        )
        return changed

    def create_principal(
        self, name: str, display_name: str, password: str
    ) -> None:
        self.ensure_initialized()
        normalized = name.strip().lower()
        if not normalized or not normalized.replace("_", "").isalnum():
            raise ValueError("Principal name must use letters, numbers, or underscores.")
        if len(password) < 10:
            raise ValueError("Principal password must be at least 10 characters.")
        salt = secrets.token_bytes(16)
        password_hash = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1
        )
        try:
            self.storage.create_principal(
                normalized, display_name.strip() or normalized, salt, password_hash
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError(f"Principal already exists: {normalized}") from exc
        self.storage.append_audit(
            actor="creator",
            action="principal.create",
            target=normalized,
            result="success",
        )

    def authenticate_principal(self, name: str, password: str) -> bool:
        self.ensure_initialized()
        principal = self.storage.get_principal(name.strip().lower())
        if principal is None or not principal["active"]:
            return False
        candidate = hashlib.scrypt(
            password.encode("utf-8"),
            salt=principal["password_salt"],
            n=2**14,
            r=8,
            p=1,
        )
        return hmac.compare_digest(candidate, principal["password_hash"])

    def vault_set(
        self, name: str, value: str, principal: str, password: str
    ) -> None:
        if not self.authenticate_principal(principal, password):
            raise ValueError("Principal authentication failed.")
        if not name.strip() or not value:
            raise ValueError("Secret name and value are required.")
        encrypted = protect(
            value.encode("utf-8"), entropy=f"ProjectBlue:{name}".encode("utf-8")
        )
        self.storage.set_secret(name.strip(), encrypted, principal)
        self.storage.append_audit(
            actor=principal,
            action="vault.set",
            target=name.strip(),
            result="success",
        )

    def vault_get(self, name: str, principal: str, password: str) -> str:
        if not self.authenticate_principal(principal, password):
            raise ValueError("Principal authentication failed.")
        record = self.storage.get_secret(name)
        if record is None:
            raise ValueError(f"Secret not found: {name}")
        if record["owner"] != principal:
            raise ValueError("Only the secret owner may retrieve it.")
        decrypted = unprotect(
            record["encrypted_blob"],
            entropy=f"ProjectBlue:{name}".encode("utf-8"),
        )
        self.storage.append_audit(
            actor=principal,
            action="vault.get",
            target=name,
            result="success",
        )
        return decrypted.decode("utf-8")

    def vault_delete(
        self, name: str, principal: str, password: str
    ) -> bool:
        if not self.authenticate_principal(principal, password):
            raise ValueError("Principal authentication failed.")
        record = self.storage.get_secret(name)
        if record is None:
            return False
        if record["owner"] != principal:
            raise ValueError("Only the secret owner may delete it.")
        deleted = self.storage.delete_secret(name)
        self.storage.append_audit(
            actor=principal,
            action="vault.delete",
            target=name,
            result="success" if deleted else "not_found",
        )
        return deleted

    def create_release_manifest(
        self, application_root: Path, destination: Path
    ) -> Path:
        self.ensure_initialized()
        root = application_root.expanduser().resolve()
        if not root.is_dir():
            raise ValueError(f"Application root does not exist: {root}")
        records: list[dict[str, Any]] = []
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(root)
            if relative.as_posix() == "BUILD_STATUS.md":
                continue
            if any(
                part in {".blue", "backups", "__pycache__", ".git"}
                for part in relative.parts
            ):
                continue
            records.append(
                {
                    "path": relative.as_posix(),
                    "bytes": path.stat().st_size,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
            )
        payload = {
            "format": "project-blue-release",
            "version": 1,
            "blue_version": __import__("project_blue").__version__,
            "created_at": utc_now(),
            "files": records,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        key = bytes.fromhex(self.storage.get_metadata("release_hmac_key"))
        signature = hmac.new(
            key, canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(
                {
                    "payload": payload,
                    "signature_algorithm": "HMAC-SHA256",
                    "signature": signature,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return destination

    def verify_release_manifest(
        self, manifest_path: Path, application_root: Path
    ) -> dict[str, Any]:
        self.ensure_initialized()
        bundle = json.loads(manifest_path.read_text(encoding="utf-8"))
        payload = bundle.get("payload")
        if not isinstance(payload, dict):
            raise ValueError("Release manifest payload is invalid.")
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        key = bytes.fromhex(self.storage.get_metadata("release_hmac_key"))
        expected = hmac.new(
            key, canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        signature_valid = hmac.compare_digest(
            expected, str(bundle.get("signature", ""))
        )
        root = application_root.expanduser().resolve()
        mismatches: list[str] = []
        for record in payload.get("files", []):
            target = (root / record["path"]).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                mismatches.append(record["path"])
                continue
            if hashlib.sha256(target.read_bytes()).hexdigest() != record["sha256"]:
                mismatches.append(record["path"])
        return {
            "signature_valid": signature_valid,
            "files_match": not mismatches,
            "mismatches": mismatches,
            "file_count": len(payload.get("files", [])),
            "blue_version": payload.get("blue_version"),
        }

    def onboard(
        self,
        identity_name: str,
        creator_password: str,
        backup_interval_hours: int = 24,
    ) -> dict[str, Any]:
        self.ensure_initialized()
        self.config.identity_name = identity_name.strip() or "Blue"
        save_config(self.home, self.config)
        self.storage.set_metadata("identity_name", self.config.identity_name)
        if self.storage.get_principal("creator") is None:
            self.create_principal("creator", "Creator", creator_password)
        elif not self.authenticate_principal("creator", creator_password):
            raise ValueError("Existing creator authentication failed.")
        self.configure_backup_verification_schedule(backup_interval_hours)
        self.storage.set_metadata("onboarded_at", utc_now())
        return {
            "identity_name": self.config.identity_name,
            "creator_principal": "creator",
            "backup_interval_hours": backup_interval_hours,
            "provider": self.config.provider,
            "home": str(self.home),
        }

    def create_forge_artifact(
        self,
        title: str,
        kind: str,
        content_file: Path,
        source_ids: list[str] | None = None,
    ) -> str:
        self.ensure_initialized()
        allowed_kinds = {"code", "document", "website", "lesson", "design"}
        if kind not in allowed_kinds:
            raise ValueError(f"Artifact kind must be one of: {sorted(allowed_kinds)}")
        content_file = content_file.expanduser().resolve()
        if not content_file.is_file() or content_file.stat().st_size > 1_000_000:
            raise ValueError("Artifact content file must exist and be at most 1 MB.")
        try:
            content = content_file.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Artifact content must be UTF-8 text.") from exc
        source_ids = source_ids or []
        for source_id in source_ids:
            if self.storage.get_source(source_id) is None:
                raise ValueError(f"Source not found: {source_id}")
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        artifact_id = self.storage.create_forge_artifact(
            title.strip() or content_file.stem,
            kind,
            content,
            digest,
            {
                "input_file": str(content_file),
                "input_sha256": hashlib.sha256(
                    content_file.read_bytes()
                ).hexdigest(),
                "creator": "creator",
                "blue_version": __import__("project_blue").__version__,
            },
            source_ids,
        )
        self.storage.append_audit(
            actor="creator",
            action="forge.artifact_create",
            target=artifact_id,
            result="success",
            details={"kind": kind, "sha256": digest, "sources": source_ids},
        )
        return artifact_id

    def forge_template(
        self,
        workspace_identifier: str,
        template: str,
        relative_path: str,
        principal: str = "creator",
    ) -> dict[str, str]:
        templates = {
            "python_cli": (
                "from __future__ import annotations\n\n"
                "def main() -> int:\n"
                '    print("Hello from Project Blue Forge")\n'
                "    return 0\n\n"
                'if __name__ == "__main__":\n'
                "    raise SystemExit(main())\n"
            ),
            "static_page": (
                "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
                "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                "<title>Blue Forge</title></head><body><h1>Blue Forge</h1></body></html>\n"
            ),
            "markdown_doc": (
                "# New Project\n\n## Purpose\n\nDescribe the project.\n\n"
                "## Requirements\n\n- Add requirements here.\n"
            ),
        }
        if template not in templates:
            raise ValueError(f"Unknown template: {template}")
        draft_dir = self.home / "forge_drafts"
        draft_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(relative_path).suffix or ".txt"
        draft = draft_dir / f"{secrets.token_hex(8)}{suffix}"
        draft.write_text(templates[template], encoding="utf-8")
        artifact_id = self.create_forge_artifact(
            f"{template} template for {relative_path}",
            "code" if template != "markdown_doc" else "document",
            draft,
        )
        change_id, approval_id = self.propose_file_change(
            workspace_identifier, relative_path, draft, principal=principal
        )
        return {
            "artifact_id": artifact_id,
            "change_id": change_id,
            "approval_id": approval_id,
            "draft": str(draft),
        }

    def forge_bundle(
        self,
        workspace_identifier: str,
        template: str,
        name: str,
        principal: str = "creator",
    ) -> dict[str, Any]:
        """Create a connected set of artifacts and approval-gated proposals.

        A bundle never writes to the registered workspace. Each generated file
        follows the same proposal and approval path as a single Forge template.
        """
        self.ensure_initialized()
        workspace = self.storage.get_workspace(workspace_identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {workspace_identifier}")
        self._require_workspace_role(workspace["id"], principal, "proposer")
        policy = self.storage.get_workspace_policy(workspace["id"])
        if policy is None:
            raise RuntimeError("Workspace policy is missing.")
        if not name.strip():
            raise ValueError("Bundle name cannot be empty.")
        package_name = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
        if not package_name:
            raise ValueError("Bundle name must contain a letter or number.")
        module_name = package_name.replace("-", "_")
        templates = {
            "python_starter": {
                "pyproject.toml": (
                    "[build-system]\n"
                    'requires = ["setuptools>=68"]\n'
                    'build-backend = "setuptools.build_meta"\n\n'
                    "[project]\n"
                    f'name = "{package_name}"\n'
                    'version = "0.1.0"\n'
                    f'description = "{name.strip()} generated by Project Blue Forge"\n'
                    'requires-python = ">=3.11"\n'
                ),
                "main.py": (
                    "from __future__ import annotations\n\n"
                    "def main() -> int:\n"
                    f'    print("Hello from {name.strip()}")\n'
                    "    return 0\n\n"
                    'if __name__ == "__main__":\n'
                    "    raise SystemExit(main())\n"
                ),
                "test_main.py": (
                    "import unittest\n\n"
                    "import main\n\n\n"
                    "class MainTests(unittest.TestCase):\n"
                    "    def test_main_succeeds(self):\n"
                    "        self.assertEqual(0, main.main())\n\n\n"
                    'if __name__ == "__main__":\n'
                    "    unittest.main()\n"
                ),
                "README.md": (
                    f"# {name.strip()}\n\n"
                    "A minimal Python starter proposed by Project Blue Forge.\n\n"
                    "## Run\n\n```powershell\npython main.py\n```\n\n"
                    "## Test\n\n```powershell\npython -m unittest test_main.py\n```\n"
                ),
            }
        }
        if template not in templates:
            raise ValueError(f"Unknown bundle template: {template}")

        generated = templates[template]
        root = Path(workspace["root_path"]).resolve()
        # Validate the whole bundle before creating any records.
        for relative_path, content in generated.items():
            _, target = self._workspace_target(workspace, relative_path)
            encoded = content.encode("utf-8")
            if len(encoded) > policy["max_file_bytes"]:
                raise ValueError(f"Generated file exceeds policy: {relative_path}")
            if not target.exists() and not policy["allow_new_files"]:
                raise ValueError(
                    "This workspace policy does not allow proposals for new files."
                )
            if target.exists() and target.read_bytes() == encoded:
                raise ValueError(
                    f"Generated content is identical to existing file: {relative_path}"
                )
        if not root.is_dir():
            raise ValueError(f"Workspace path is unavailable: {root}")

        draft_dir = self.home / "forge_drafts" / secrets.token_hex(8)
        draft_dir.mkdir(parents=True, exist_ok=False)
        bundle_id = self.storage.create_forge_bundle(
            name.strip(), template, workspace["id"]
        )
        items: list[dict[str, str]] = []
        primary_artifact_id = ""
        for relative_path, content in generated.items():
            draft = draft_dir / relative_path
            draft.write_text(content, encoding="utf-8")
            kind = "document" if draft.suffix.lower() == ".md" else "code"
            artifact_id = self.create_forge_artifact(
                f"{name.strip()}: {relative_path}", kind, draft
            )
            change_id, approval_id = self.propose_file_change(
                workspace_identifier,
                relative_path,
                draft,
                principal=principal,
            )
            self.storage.add_forge_bundle_item(
                bundle_id, artifact_id, change_id, relative_path
            )
            if relative_path == "main.py":
                primary_artifact_id = artifact_id
            items.append(
                {
                    "relative_path": relative_path,
                    "artifact_id": artifact_id,
                    "change_id": change_id,
                    "approval_id": approval_id,
                }
            )
        for item in items:
            if item["artifact_id"] != primary_artifact_id:
                self.storage.add_artifact_relation(
                    primary_artifact_id, item["artifact_id"], "contains"
                )
        self.storage.append_audit(
            actor=principal,
            action="forge.bundle_create",
            target=bundle_id,
            result="pending_approval",
            details={
                "template": template,
                "workspace_id": workspace["id"],
                "files": [item["relative_path"] for item in items],
                "module_name": module_name,
            },
        )
        return {
            "bundle_id": bundle_id,
            "name": name.strip(),
            "template": template,
            "status": "proposed",
            "items": items,
            "workspace_writes": 0,
        }

    def request_artifact_release(
        self, artifact_id: str, required_votes: int = 1
    ) -> str:
        self.ensure_initialized()
        artifact = self.storage.get_forge_artifact(artifact_id)
        if artifact is None or artifact["status"] != "draft":
            raise ValueError("Only a draft artifact can request release.")
        approval_id, _ = self.request_approval(
            "publish",
            f"Release Forge artifact '{artifact['title']}'",
            {
                "artifact_id": artifact_id,
                "sha256": artifact["sha256"],
                "kind": artifact["kind"],
            },
            lifetime_hours=24,
            required_votes=required_votes,
        )
        if not self.storage.attach_artifact_approval(artifact_id, approval_id):
            raise RuntimeError("Could not attach artifact release approval.")
        return approval_id

    def release_artifact(self, artifact_id: str) -> dict[str, Any]:
        self.ensure_initialized()
        artifact = self.storage.get_forge_artifact(artifact_id)
        if artifact is None or artifact["status"] != "review_pending":
            raise ValueError("Artifact is not pending release review.")
        approval = self.storage.get_approval(artifact["approval_id"])
        if approval is None or approval["status"] != "approved":
            raise ValueError("Artifact release approval is not approved.")
        current_hash = hashlib.sha256(
            artifact["content"].encode("utf-8")
        ).hexdigest()
        if current_hash != artifact["sha256"]:
            raise ValueError("Artifact content hash no longer matches.")
        payload = {
            "artifact_id": artifact_id,
            "title": artifact["title"],
            "kind": artifact["kind"],
            "sha256": artifact["sha256"],
            "provenance_json": artifact["provenance_json"],
            "approval_id": artifact["approval_id"],
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        key = bytes.fromhex(
            self.storage.get_metadata("forge_release_hmac_key")
        )
        signature = hmac.new(
            key, canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not self.storage.mark_artifact_released(artifact_id, signature):
            raise RuntimeError("Could not mark artifact released.")
        self.record_execution_receipt(
            artifact["approval_id"],
            "succeeded",
            f"Released Forge artifact {artifact_id}.",
            executor="blue_forge",
        )
        return {
            **payload,
            "signature_algorithm": "HMAC-SHA256",
            "signature": signature,
        }

    def verify_artifact_release(self, artifact_id: str) -> dict[str, Any]:
        self.ensure_initialized()
        artifact = self.storage.get_forge_artifact(artifact_id)
        if artifact is None or artifact["status"] != "released":
            raise ValueError("Artifact is not released.")
        payload = {
            "artifact_id": artifact_id,
            "title": artifact["title"],
            "kind": artifact["kind"],
            "sha256": artifact["sha256"],
            "provenance_json": artifact["provenance_json"],
            "approval_id": artifact["approval_id"],
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        key = bytes.fromhex(
            self.storage.get_metadata("forge_release_hmac_key")
        )
        expected = hmac.new(
            key, canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        content_match = hashlib.sha256(
            artifact["content"].encode("utf-8")
        ).hexdigest() == artifact["sha256"]
        return {
            "artifact_id": artifact_id,
            "signature_valid": hmac.compare_digest(
                expected, artifact["release_signature"] or ""
            ),
            "content_match": content_match,
        }

    RUNNERS = {
        "python_compile": lambda: [
            sys.executable,
            "-m",
            "compileall",
            "-q",
            ".",
        ],
        "python_unittest": lambda: [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "tests",
        ],
    }

    def runner_policy(self, workspace_identifier: str) -> list[dict[str, Any]]:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(workspace_identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {workspace_identifier}")
        return self.storage.list_runner_policies(workspace["id"])

    def set_runner_policy(
        self,
        workspace_identifier: str,
        runner: str,
        enabled: bool,
        principal: str = "creator",
    ) -> None:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(workspace_identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {workspace_identifier}")
        self._require_workspace_role(workspace["id"], principal, "maintainer")
        if runner not in self.RUNNERS:
            raise ValueError(f"Runner must be one of: {sorted(self.RUNNERS)}")
        self.storage.set_runner_policy(workspace["id"], runner, enabled)
        self.storage.append_audit(
            actor=principal,
            action="runner.policy_update",
            target=workspace["id"],
            result="success",
            details={"runner": runner, "enabled": enabled},
        )

    def request_execution_run(
        self,
        workspace_identifier: str,
        runner: str,
        principal: str = "creator",
    ) -> tuple[str, str]:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(workspace_identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {workspace_identifier}")
        self._require_workspace_role(workspace["id"], principal, "proposer")
        if runner not in self.RUNNERS:
            raise ValueError(f"Runner must be one of: {sorted(self.RUNNERS)}")
        runner_policy = self.storage.get_runner_policy(
            workspace["id"], runner
        )
        if runner_policy is None or not runner_policy["enabled"]:
            raise ValueError(
                f"Runner '{runner}' is disabled by this workspace's policy."
            )
        command = self.RUNNERS[runner]()
        approval_id, _ = self.request_approval(
            "code_execution",
            f"Run allowlisted '{runner}' in workspace {workspace['name']}",
            {
                "workspace_id": workspace["id"],
                "runner": runner,
                "command": command,
            },
            lifetime_hours=4,
        )
        run_id = self.storage.create_execution_run(
            workspace["id"], runner, approval_id, command, principal
        )
        self.storage.append_audit(
            actor=principal,
            action="runner.request",
            target=run_id,
            result="pending_approval",
            details={"runner": runner, "approval_id": approval_id},
        )
        return run_id, approval_id

    def execute_run(
        self, run_id: str, principal: str = "creator"
    ) -> dict[str, Any]:
        self.ensure_initialized()
        run = self.storage.get_execution_run(run_id)
        if run is None or run["status"] != "pending":
            raise ValueError("Execution run is missing or no longer pending.")
        workspace = self.storage.get_workspace(run["workspace_id"])
        if workspace is None:
            raise ValueError("Execution workspace no longer exists.")
        self._require_workspace_role(workspace["id"], principal, "maintainer")
        approval = self.storage.get_approval(run["approval_id"])
        if approval is None or approval["status"] != "approved":
            raise ValueError("Execution requires an active approved request.")
        command = json.loads(run["command_json"])
        expected = self.RUNNERS[run["runner"]]()
        if command != expected:
            raise ValueError("Stored runner command failed allowlist verification.")
        root = Path(workspace["root_path"]).resolve()
        if not root.is_dir() or not self.storage.start_execution_run(run_id):
            raise ValueError("Execution workspace is unavailable or run already started.")
        environment = {
            key: value
            for key, value in os.environ.items()
            if key.upper() in {"PATH", "SYSTEMROOT", "TEMP", "TMP"}
        }
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        environment["PYTHONIOENCODING"] = "utf-8"
        try:
            completed = subprocess.run(
                command,
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
                timeout=60,
                shell=False,
            )
            stdout = completed.stdout[-100_000:]
            stderr = completed.stderr[-100_000:]
            status = "succeeded" if completed.returncode == 0 else "failed"
            exit_code = completed.returncode
        except subprocess.TimeoutExpired as exc:
            stdout = (exc.stdout or "")[-100_000:]
            stderr = ((exc.stderr or "") + "\nTimed out after 60 seconds.")[-100_000:]
            status = "timed_out"
            exit_code = None
        result_payload = {
            "run_id": run_id,
            "runner": run["runner"],
            "command": command,
            "status": status,
            "exit_code": exit_code,
            "stdout_sha256": hashlib.sha256(stdout.encode("utf-8")).hexdigest(),
            "stderr_sha256": hashlib.sha256(stderr.encode("utf-8")).hexdigest(),
        }
        canonical = json.dumps(
            result_payload, sort_keys=True, separators=(",", ":")
        )
        result_sha256 = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        runner_key = bytes.fromhex(
            self.storage.get_metadata("runner_hmac_key")
        )
        result_signature = hmac.new(
            runner_key, canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        self.storage.finish_execution_run(
            run_id,
            status,
            exit_code,
            stdout,
            stderr,
            result_sha256,
            result_signature,
        )
        self.record_execution_receipt(
            run["approval_id"],
            "succeeded" if status == "succeeded" else "failed",
            f"Runner {run['runner']} finished with status {status}.",
            executor="blue_forge_runner",
        )
        self.storage.append_audit(
            actor="blue_forge_runner",
            action="runner.execute",
            target=run_id,
            result=status,
            details={"exit_code": exit_code},
        )
        return {
            "run_id": run_id,
            "runner": run["runner"],
            "status": status,
            "exit_code": exit_code,
            "stdout": stdout,
            "stderr": stderr,
            "boundary": "allowlisted process with timeout; not an OS security sandbox",
            "result_sha256": result_sha256,
            "result_signature": result_signature,
        }

    def verify_execution_run(self, run_id: str) -> dict[str, Any]:
        self.ensure_initialized()
        run = self.storage.get_execution_run(run_id)
        if run is None or run["status"] in {"pending", "running"}:
            raise ValueError("Execution run has no completed attestation.")
        command = json.loads(run["command_json"])
        payload = {
            "run_id": run_id,
            "runner": run["runner"],
            "command": command,
            "status": run["status"],
            "exit_code": run["exit_code"],
            "stdout_sha256": hashlib.sha256(
                (run["stdout"] or "").encode("utf-8")
            ).hexdigest(),
            "stderr_sha256": hashlib.sha256(
                (run["stderr"] or "").encode("utf-8")
            ).hexdigest(),
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        calculated_hash = hashlib.sha256(
            canonical.encode("utf-8")
        ).hexdigest()
        key = bytes.fromhex(self.storage.get_metadata("runner_hmac_key"))
        expected_signature = hmac.new(
            key, canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return {
            "run_id": run_id,
            "hash_valid": hmac.compare_digest(
                calculated_hash, run["result_sha256"] or ""
            ),
            "signature_valid": hmac.compare_digest(
                expected_signature, run["result_signature"] or ""
            ),
        }

    def academy_ask(self, question: str) -> dict[str, Any]:
        self.ensure_initialized()
        if not question.strip():
            raise ValueError("Question cannot be empty.")
        results = [
            row
            for row in self.storage.unified_search(question, limit=20)
            if row["type"] == "source"
        ][:5]
        citations: list[dict[str, Any]] = []
        excerpts: list[str] = []
        for index, row in enumerate(results, start=1):
            source = self.storage.get_source(row["id"])
            excerpt = " ".join(source["content"].split())[:400]
            citations.append(
                {
                    "number": index,
                    "source_id": source["id"],
                    "title": source["title"],
                    "sha256": source["sha256"],
                }
            )
            excerpts.append(f"[{index}] {source['title']}: {excerpt}")
        if excerpts:
            answer = (
                "Blue Academy found the following relevant stored evidence. "
                "These excerpts are source material, not a generated conclusion:\n\n"
                + "\n\n".join(excerpts)
            )
        else:
            answer = (
                "Blue Academy found no stored source that supports an answer. "
                "Add a trusted source or refine the question."
            )
        answer_id = self.storage.create_academy_answer(
            question.strip(), answer, citations
        )
        return {
            "answer_id": answer_id,
            "question": question.strip(),
            "answer": answer,
            "citations": citations,
        }

    def academy_create_lesson(self, topic: str) -> dict[str, Any]:
        self.ensure_initialized()
        if not topic.strip():
            raise ValueError("Lesson topic cannot be empty.")
        results = [
            row
            for row in self.storage.unified_search(topic, limit=20)
            if row["type"] == "source"
        ][:5]
        if not results:
            raise ValueError(
                "Academy cannot create a lesson without a matching stored source."
            )
        citations: list[dict[str, Any]] = []
        evidence: list[str] = []
        for index, row in enumerate(results, start=1):
            source = self.storage.get_source(row["id"])
            excerpt = " ".join(source["content"].split())[:600]
            citations.append(
                {
                    "number": index,
                    "source_id": source["id"],
                    "title": source["title"],
                    "sha256": source["sha256"],
                }
            )
            evidence.append(f"### Source {index}: {source['title']}\n\n{excerpt}")
        title = f"Blue Academy Lesson: {topic.strip()}"
        content = (
            f"# {title}\n\n"
            "## Learning objectives\n\n"
            f"- Identify the central ideas related to {topic.strip()}.\n"
            "- Trace each claim back to stored evidence.\n"
            "- Distinguish source material from interpretation.\n\n"
            "## Evidence\n\n"
            + "\n\n".join(evidence)
            + "\n\n## Review questions\n\n"
            f"1. What do the cited sources establish about {topic.strip()}?\n"
            "2. Which details remain uncertain or unsupported?\n"
            "3. How would you verify the claims independently?\n"
        )
        content_sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
        lesson_id = self.storage.create_academy_lesson(
            title, topic.strip(), content, citations, content_sha
        )
        return {
            "lesson_id": lesson_id,
            "title": title,
            "content": content,
            "content_sha256": content_sha,
            "citations": citations,
        }

    def academy_create_assessment(self, lesson_id: str) -> dict[str, Any]:
        self.ensure_initialized()
        lesson = self.storage.get_academy_lesson(lesson_id)
        if lesson is None:
            raise ValueError(f"Academy lesson not found: {lesson_id}")
        citations = json.loads(lesson["citations_json"])
        if not citations:
            raise ValueError("An assessment requires a lesson with cited evidence.")
        first_source = citations[0]
        questions = [
            {
                "id": "q1",
                "prompt": (
                    f"What central claims does the lesson make about "
                    f"{lesson['topic']}, and which citation supports each claim?"
                ),
                "evidence_scope": [row["source_id"] for row in citations],
            },
            {
                "id": "q2",
                "prompt": (
                    f"Using '{first_source['title']}', identify one relevant "
                    "piece of evidence and explain its relevance."
                ),
                "evidence_scope": [first_source["source_id"]],
            },
            {
                "id": "q3",
                "prompt": (
                    "Identify one uncertainty or unsupported inference and "
                    "describe how you would verify it."
                ),
                "evidence_scope": [row["source_id"] for row in citations],
            },
        ]
        rubric = [
            {
                "question_id": question["id"],
                "review_standard": (
                    "A human reviewer checks accuracy, citation traceability, "
                    "and whether unsupported claims are clearly labeled."
                ),
                "automatic_score": False,
            }
            for question in questions
        ]
        title = f"Assessment: {lesson['title']}"
        assessment_id = self.storage.create_academy_assessment(
            lesson_id, title, questions, rubric
        )
        self.storage.append_audit(
            actor="creator",
            action="academy.assessment_create",
            target=assessment_id,
            result="success",
            details={"lesson_id": lesson_id, "question_count": len(questions)},
        )
        return {
            "assessment_id": assessment_id,
            "lesson_id": lesson_id,
            "title": title,
            "questions": questions,
            "rubric": rubric,
            "grading": "human_review_required",
        }

    def academy_submit_assessment(
        self, assessment_id: str, principal: str, answers: list[str]
    ) -> dict[str, Any]:
        self.ensure_initialized()
        assessment = self.storage.get_academy_assessment(assessment_id)
        if assessment is None:
            raise ValueError(f"Academy assessment not found: {assessment_id}")
        if not principal.strip():
            raise ValueError("Submission principal cannot be empty.")
        questions = json.loads(assessment["questions_json"])
        if len(answers) != len(questions):
            raise ValueError(
                f"Assessment requires exactly {len(questions)} answers."
            )
        if any(not isinstance(answer, str) or not answer.strip() for answer in answers):
            raise ValueError("Every assessment answer must be non-empty text.")
        submission_id = self.storage.create_academy_submission(
            assessment_id,
            principal.strip(),
            [answer.strip() for answer in answers],
        )
        self.storage.append_audit(
            actor=principal.strip(),
            action="academy.assessment_submit",
            target=submission_id,
            result="submitted_for_review",
            details={"assessment_id": assessment_id},
        )
        return {
            "submission_id": submission_id,
            "assessment_id": assessment_id,
            "principal": principal.strip(),
            "status": "submitted_for_review",
            "score": None,
            "grading": "human_review_required",
        }

    def decide_approval(
        self, approval_id: str, decision: str, note: str = ""
    ) -> bool:
        self.ensure_initialized()
        changed = self.storage.decide_approval(
            approval_id, decision, "creator", note
        )
        self.storage.append_audit(
            actor="creator",
            action="approval.decide",
            target=approval_id,
            result=decision if changed else "not_found_or_already_decided",
        )
        return changed

    def add_source(self, source: Path, title: str | None = None) -> str:
        self.ensure_initialized()
        source = source.expanduser().resolve()
        if not source.is_file():
            raise ValueError(f"Source file does not exist: {source}")
        if source.stat().st_size > 2_000_000:
            raise ValueError("Phase 1.3 source files are limited to 2 MB.")
        if source.suffix.lower() not in {".txt", ".md", ".json", ".csv", ".py"}:
            raise ValueError("Supported source types: .txt, .md, .json, .csv, .py")
        try:
            content = source.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Source must be UTF-8 text.") from exc
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        for existing in self.storage.list_sources():
            if existing["sha256"] == digest:
                raise ValueError(
                    f"This exact source is already stored as {existing['id']}."
                )
        source_id = self.storage.add_source(
            title=(title or source.stem).strip(),
            original_path=str(source),
            media_type=mimetypes.guess_type(source.name)[0] or "text/plain",
            sha256=digest,
            content=content,
        )
        self.storage.append_audit(
            actor="creator",
            action="source.add",
            target=source_id,
            result="success",
            details={"sha256": digest, "original_path": str(source)},
        )
        return source_id

    def remove_source(self, source_id: str) -> bool:
        self.ensure_initialized()
        removed = self.storage.delete_source(source_id)
        self.storage.append_audit(
            actor="creator",
            action="source.remove",
            target=source_id,
            result="success" if removed else "not_found",
        )
        return removed

    def cite_memory(
        self,
        memory_id: str,
        source_id: str,
        locator: str = "",
        note: str = "",
    ) -> str:
        self.ensure_initialized()
        if self.storage.get_memory(memory_id) is None:
            raise ValueError(f"Memory not found: {memory_id}")
        if self.storage.get_source(source_id) is None:
            raise ValueError(f"Source not found: {source_id}")
        try:
            citation_id = self.storage.add_citation(
                memory_id, source_id, locator, note
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("That citation already exists.") from exc
        self.storage.append_audit(
            actor="creator",
            action="citation.create",
            target=citation_id,
            result="success",
            details={"memory_id": memory_id, "source_id": source_id},
        )
        return citation_id

    def create_conversation(self, title: str) -> str:
        self.ensure_initialized()
        if not title.strip():
            raise ValueError("Conversation title cannot be empty.")
        conversation_id = self.storage.create_conversation(title)
        self.storage.append_audit(
            actor="creator",
            action="conversation.create",
            target=conversation_id,
            result="success",
            details={"title": title},
        )
        return conversation_id

    def activate_session(self, title: str = "Active Blue Session") -> dict[str, Any]:
        """Open or resume a named, persistent, policy-governed Blue session."""
        self.ensure_initialized()
        clean_title = title.strip() or "Active Blue Session"
        conversation = self.storage.get_conversation(clean_title)
        if conversation is None:
            conversation_id = self.create_conversation(clean_title)
            resumed = False
        else:
            conversation_id = conversation["id"]
            resumed = True
        provider = self.provider_status()
        self.storage.append_audit(
            actor="creator",
            action="blue.activate",
            target=conversation_id,
            result="resumed" if resumed else "created",
            details={"provider": provider["provider"]},
        )
        return {
            "conversation_id": conversation_id,
            "title": clean_title,
            "resumed": resumed,
            "provider": provider,
            "capabilities": {
                "talk": "persistent named conversation",
                "learn": "creator-selected sources, memories, and cited lessons",
                "make": "Forge artifacts and approval-gated file proposals",
            },
            "boundaries": [
                "Blue identifies as AI.",
                "Learning requires creator-selected information.",
                "Project changes remain approval-gated.",
                "No language model is downloaded or activated silently.",
            ],
        }

    def conversation_chat(
        self, conversation_identifier: str, prompt: str
    ) -> tuple[str, PolicyResult]:
        self.ensure_initialized()
        conversation = self.storage.get_conversation(conversation_identifier)
        if conversation is None:
            raise ValueError(f"Conversation not found: {conversation_identifier}")
        decision = self.evaluate(prompt)
        history = self.storage.conversation_entries(conversation["id"], limit=24)
        self.storage.add_conversation_entry(
            conversation["id"], "user", prompt, self.config.provider
        )
        if decision.decision is Decision.BLOCK:
            response = (
                "I’m Blue, an AI. I can’t help with that because it conflicts "
                "with my Constitution and peaceful-purpose rules."
            )
            result = "blocked"
        else:
            context = self._chat_context(prompt)
            response = self.provider().generate(prompt, context, history)
            result = "success"
        self.storage.add_conversation_entry(
            conversation["id"], "assistant", response, self.config.provider
        )
        self.storage.append_audit(
            actor="creator",
            action="conversation.chat",
            target=conversation["id"],
            result=result,
            details={
                "rule": decision.rule,
                "context_count": (
                    len(context) if decision.decision is not Decision.BLOCK else 0
                ),
                "history_count": len(history),
            },
        )
        return response, decision

    def record_execution_receipt(
        self,
        approval_id: str,
        outcome: str,
        details: str,
        executor: str = "creator",
    ) -> str:
        self.ensure_initialized()
        approval = self.storage.get_approval(approval_id)
        if approval is None:
            raise ValueError(f"Approval not found: {approval_id}")
        if approval["status"] != "approved":
            raise ValueError("Execution receipts require an approved request.")
        if outcome not in {"succeeded", "failed", "cancelled"}:
            raise ValueError("Outcome must be succeeded, failed, or cancelled.")
        receipt_id = self.storage.add_execution_receipt(
            approval_id, executor, outcome, details
        )
        self.storage.append_audit(
            actor=executor,
            action="approval.receipt",
            target=receipt_id,
            result=outcome,
            details={"approval_id": approval_id},
        )
        return receipt_id

    def register_workspace(self, name: str, root_path: Path) -> str:
        self.ensure_initialized()
        root = root_path.expanduser().resolve()
        if not root.is_dir():
            raise ValueError(f"Workspace directory does not exist: {root}")
        if not name.strip():
            raise ValueError("Workspace name cannot be empty.")
        try:
            workspace_id = self.storage.register_workspace(name, str(root))
        except sqlite3.IntegrityError as exc:
            raise ValueError("Workspace name or path is already registered.") from exc
        self.storage.append_audit(
            actor="creator",
            action="workspace.register",
            target=workspace_id,
            result="success",
            details={"name": name, "root_path": str(root), "mode": "read_only"},
        )
        return workspace_id

    ROLE_LEVELS = {"viewer": 1, "proposer": 2, "maintainer": 3}

    def _require_workspace_role(
        self, workspace_id: str, principal: str, required: str
    ) -> None:
        access = self.storage.get_workspace_access(workspace_id, principal)
        if access is None:
            raise ValueError(
                f"Principal '{principal}' has no access to this workspace."
            )
        if self.ROLE_LEVELS[access["role"]] < self.ROLE_LEVELS[required]:
            raise ValueError(
                f"Role '{access['role']}' cannot perform an operation requiring '{required}'."
            )

    def grant_workspace_access(
        self, identifier: str, principal: str, role: str
    ) -> None:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {identifier}")
        if not principal.strip() or role not in self.ROLE_LEVELS:
            raise ValueError("Principal is required and role must be viewer, proposer, or maintainer.")
        self.storage.set_workspace_access(workspace["id"], principal.strip(), role)
        self.storage.append_audit(
            actor="creator",
            action="workspace.access_grant",
            target=workspace["id"],
            result="success",
            details={"principal": principal.strip(), "role": role},
        )

    def revoke_workspace_access(self, identifier: str, principal: str) -> bool:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {identifier}")
        removed = self.storage.remove_workspace_access(
            workspace["id"], principal.strip()
        )
        self.storage.append_audit(
            actor="creator",
            action="workspace.access_revoke",
            target=workspace["id"],
            result="success" if removed else "not_found_or_protected",
            details={"principal": principal.strip()},
        )
        return removed

    def index_workspace(
        self, identifier: str, principal: str = "creator"
    ) -> dict[str, Any]:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {identifier}")
        self._require_workspace_role(workspace["id"], principal, "viewer")
        root = Path(workspace["root_path"]).resolve()
        if not root.is_dir():
            raise ValueError(f"Workspace path is unavailable: {root}")
        policy = self.storage.get_workspace_policy(workspace["id"])
        if policy is None:
            raise RuntimeError("Workspace policy is missing.")
        records: list[dict[str, Any]] = []
        skipped = 0
        total_bytes = 0
        for path in root.rglob("*"):
            if len(records) >= 5000:
                skipped += 1
                continue
            relative = path.relative_to(root)
            if any(part in self.IGNORED_DIRECTORIES for part in relative.parts):
                continue
            if not path.is_file() or path.is_symlink():
                continue
            if path.suffix.lower() not in self.TEXT_EXTENSIONS:
                skipped += 1
                continue
            resolved = path.resolve()
            if not resolved.is_relative_to(root):
                skipped += 1
                continue
            size = path.stat().st_size
            if (
                size > policy["max_file_bytes"]
                or total_bytes + size > policy["max_total_bytes"]
            ):
                skipped += 1
                continue
            try:
                raw = path.read_bytes()
                content = raw.decode("utf-8")
            except (OSError, UnicodeDecodeError):
                skipped += 1
                continue
            records.append(
                {
                    "relative_path": relative.as_posix(),
                    "size": size,
                    "modified_at": path.stat().st_mtime,
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "content": content,
                }
            )
            total_bytes += size
        self.storage.replace_workspace_files(workspace["id"], records)
        self.storage.append_audit(
            actor="creator",
            action="workspace.index",
            target=workspace["id"],
            result="success",
            details={
                "files": len(records),
                "bytes": total_bytes,
                "skipped": skipped,
                "mode": "read_only",
            },
        )
        return {
            "workspace": workspace["name"],
            "files_indexed": len(records),
            "bytes_indexed": total_bytes,
            "files_skipped": skipped,
            "mode": "read_only",
            "max_file_bytes": policy["max_file_bytes"],
            "max_total_bytes": policy["max_total_bytes"],
        }

    def workspace_policy(
        self, identifier: str, principal: str = "creator"
    ) -> dict[str, Any]:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {identifier}")
        self._require_workspace_role(workspace["id"], principal, "viewer")
        policy = self.storage.get_workspace_policy(workspace["id"])
        if policy is None:
            raise RuntimeError("Workspace policy is missing.")
        return {"workspace": workspace["name"], **policy}

    def update_workspace_policy(
        self,
        identifier: str,
        *,
        max_file_bytes: int,
        max_total_bytes: int,
        allow_new_files: bool,
        proposal_lifetime_hours: int,
        principal: str = "creator",
    ) -> dict[str, Any]:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {identifier}")
        self._require_workspace_role(workspace["id"], principal, "maintainer")
        if not 1_024 <= max_file_bytes <= 2_000_000:
            raise ValueError("max_file_bytes must be between 1 KB and 2 MB.")
        if not max_file_bytes <= max_total_bytes <= 100_000_000:
            raise ValueError(
                "max_total_bytes must be at least max_file_bytes and at most 100 MB."
            )
        if not 1 <= proposal_lifetime_hours <= 720:
            raise ValueError("Proposal lifetime must be between 1 and 720 hours.")
        self.storage.update_workspace_policy(
            workspace["id"],
            max_file_bytes=max_file_bytes,
            max_total_bytes=max_total_bytes,
            allow_new_files=allow_new_files,
            proposal_lifetime_hours=proposal_lifetime_hours,
        )
        self.storage.append_audit(
            actor="creator",
            action="workspace.policy_update",
            target=workspace["id"],
            result="success",
            details={
                "max_file_bytes": max_file_bytes,
                "max_total_bytes": max_total_bytes,
                "allow_new_files": allow_new_files,
                "proposal_lifetime_hours": proposal_lifetime_hours,
            },
        )
        return self.workspace_policy(workspace["id"])

    def workspace_freshness(
        self, identifier: str, principal: str = "creator"
    ) -> dict[str, Any]:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {identifier}")
        self._require_workspace_role(workspace["id"], principal, "viewer")
        root = Path(workspace["root_path"]).resolve()
        unchanged = 0
        changed: list[str] = []
        missing: list[str] = []
        for record in self.storage.list_workspace_files(
            workspace["id"], limit=1_000_000
        ):
            target = root / Path(record["relative_path"])
            if not target.exists():
                missing.append(record["relative_path"])
                continue
            if target.is_symlink() or not target.resolve().is_relative_to(root):
                changed.append(record["relative_path"])
                continue
            current_hash = hashlib.sha256(target.read_bytes()).hexdigest()
            if current_hash == record["sha256"]:
                unchanged += 1
            else:
                changed.append(record["relative_path"])
        return {
            "workspace": workspace["name"],
            "unchanged": unchanged,
            "changed": changed,
            "missing": missing,
            "fresh": not changed and not missing,
        }

    def _workspace_target(
        self, workspace: dict[str, Any], relative_path: str
    ) -> tuple[Path, Path]:
        root = Path(workspace["root_path"]).resolve()
        relative = Path(relative_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Change path must stay inside the registered workspace.")
        target = root / relative
        parent = target.parent.resolve()
        if not parent.is_relative_to(root) or not parent.is_dir():
            raise ValueError("Change target parent is outside or missing.")
        if target.exists() and (
            target.is_symlink() or not target.resolve().is_relative_to(root)
        ):
            raise ValueError("Symlinked or external change targets are not allowed.")
        if target.suffix.lower() not in self.TEXT_EXTENSIONS:
            raise ValueError("Only supported text files can be proposed.")
        return root, target

    def propose_file_change(
        self,
        workspace_identifier: str,
        relative_path: str,
        proposed_file: Path,
        principal: str = "creator",
    ) -> tuple[str, str]:
        self.ensure_initialized()
        workspace = self.storage.get_workspace(workspace_identifier)
        if workspace is None:
            raise ValueError(f"Workspace not found: {workspace_identifier}")
        self._require_workspace_role(workspace["id"], principal, "proposer")
        proposed_file = proposed_file.expanduser().resolve()
        if not proposed_file.is_file() or proposed_file.stat().st_size > 1_000_000:
            raise ValueError("Proposed content file must exist and be at most 1 MB.")
        try:
            proposed_content = proposed_file.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Proposed content must be UTF-8 text.") from exc
        _, target = self._workspace_target(workspace, relative_path)
        policy = self.storage.get_workspace_policy(workspace["id"])
        if policy is None:
            raise RuntimeError("Workspace policy is missing.")
        if proposed_file.stat().st_size > policy["max_file_bytes"]:
            raise ValueError("Proposed content exceeds this workspace's file limit.")
        if target.exists():
            original_bytes = target.read_bytes()
            try:
                original_content = original_bytes.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise ValueError("Existing target is not UTF-8 text.") from exc
            original_sha = hashlib.sha256(original_bytes).hexdigest()
        else:
            if not policy["allow_new_files"]:
                raise ValueError(
                    "This workspace policy does not allow proposals for new files."
                )
            original_content = ""
            original_sha = "MISSING"
        diff = "".join(
            difflib.unified_diff(
                original_content.splitlines(keepends=True),
                proposed_content.splitlines(keepends=True),
                fromfile=f"a/{relative_path}",
                tofile=f"b/{relative_path}",
            )
        )
        if not diff:
            raise ValueError("Proposed content is identical to the current file.")
        approval_id, _ = self.request_approval(
            "file_change",
            f"Apply proposed change to {workspace['name']}:{relative_path}",
            {"workspace_id": workspace["id"], "relative_path": relative_path},
        )
        change_id = self.storage.create_proposed_change(
            workspace["id"],
            Path(relative_path).as_posix(),
            original_sha,
            proposed_content,
            diff,
            approval_id,
            policy["proposal_lifetime_hours"],
        )
        self.storage.append_audit(
            actor="creator",
            action="change.propose",
            target=change_id,
            result="pending_approval",
            details={"approval_id": approval_id, "relative_path": relative_path},
        )
        return change_id, approval_id

    def apply_proposed_change(
        self, change_id: str, principal: str = "creator"
    ) -> Path:
        self.ensure_initialized()
        self.storage.expire_changes()
        change = self.storage.get_proposed_change(change_id)
        if change is None:
            raise ValueError(f"Proposed change not found: {change_id}")
        if change["status"] != "proposed":
            raise ValueError("Only proposed changes can be applied.")
        approval = self.storage.get_approval(change["approval_id"])
        if approval is None or approval["status"] != "approved":
            raise ValueError("The linked approval must be approved first.")
        workspace = self.storage.get_workspace(change["workspace_id"])
        if workspace is None:
            raise ValueError("Registered workspace no longer exists.")
        self._require_workspace_role(workspace["id"], principal, "maintainer")
        _, target = self._workspace_target(workspace, change["relative_path"])
        if target.exists():
            current_bytes = target.read_bytes()
            current_sha = hashlib.sha256(current_bytes).hexdigest()
        else:
            current_bytes = b""
            current_sha = "MISSING"
        if current_sha != change["original_sha256"]:
            raise ValueError(
                "Target changed after the proposal; create a fresh diff before applying."
            )
        backup_path = ""
        if target.exists():
            backup_dir = self.home / "change_backups" / change_id
            backup_dir.mkdir(parents=True, exist_ok=False)
            backup = backup_dir / target.name
            backup.write_bytes(current_bytes)
            backup_path = str(backup)
        temporary_name: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=target.parent,
                prefix=f".{target.name}.blue-",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary.write(change["proposed_content"])
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary_name = temporary.name
            os.replace(temporary_name, target)
        finally:
            if temporary_name and Path(temporary_name).exists():
                Path(temporary_name).unlink()
        post_apply_sha = hashlib.sha256(target.read_bytes()).hexdigest()
        self.storage.mark_change_applied(
            change_id, backup_path, post_apply_sha
        )
        self.record_execution_receipt(
            change["approval_id"],
            "succeeded",
            f"Applied change {change_id} to {target}",
            executor="blue_core",
        )
        self.storage.append_audit(
            actor="blue_core",
            action="change.apply",
            target=str(target),
            result="success",
            details={"change_id": change_id, "backup_path": backup_path},
        )
        return target

    def reject_proposed_change(
        self, change_id: str, reason: str, principal: str = "creator"
    ) -> bool:
        self.ensure_initialized()
        change = self.storage.get_proposed_change(change_id)
        if change is None:
            raise ValueError(f"Proposed change not found: {change_id}")
        self._require_workspace_role(
            change["workspace_id"], principal, "maintainer"
        )
        if not reason.strip():
            raise ValueError("Rejection reason cannot be empty.")
        rejected = self.storage.reject_change(change_id, reason.strip())
        if rejected:
            approval = self.storage.get_approval(change["approval_id"])
            if approval and approval["status"] == "pending":
                self.storage.decide_approval(
                    change["approval_id"], "denied", "creator", reason.strip()
                )
            self.storage.append_audit(
                actor="creator",
                action="change.reject",
                target=change_id,
                result="rejected",
                details={"reason": reason.strip()},
            )
        return rejected

    def request_change_rollback(
        self, change_id: str, principal: str = "creator"
    ) -> str:
        self.ensure_initialized()
        change = self.storage.get_proposed_change(change_id)
        if change is None or change["status"] != "applied":
            raise ValueError("Only an applied change can request rollback.")
        self._require_workspace_role(
            change["workspace_id"], principal, "maintainer"
        )
        if change["rollback_approval_id"]:
            raise ValueError("A rollback approval already exists.")
        approval_id, _ = self.request_approval(
            "file_change",
            f"Rollback applied file change {change_id}",
            {"change_id": change_id, "operation": "rollback"},
        )
        if not self.storage.set_rollback_approval(change_id, approval_id):
            raise RuntimeError("Could not attach rollback approval.")
        self.storage.append_audit(
            actor="creator",
            action="change.rollback_request",
            target=change_id,
            result="pending_approval",
            details={"approval_id": approval_id},
        )
        return approval_id

    def rollback_change(
        self, change_id: str, principal: str = "creator"
    ) -> Path:
        self.ensure_initialized()
        change = self.storage.get_proposed_change(change_id)
        if change is None or change["status"] != "applied":
            raise ValueError("Only an applied change can be rolled back.")
        approval = self.storage.get_approval(change["rollback_approval_id"])
        if approval is None or approval["status"] != "approved":
            raise ValueError("The linked rollback approval must be approved first.")
        workspace = self.storage.get_workspace(change["workspace_id"])
        if workspace is None:
            raise ValueError("Registered workspace no longer exists.")
        self._require_workspace_role(workspace["id"], principal, "maintainer")
        _, target = self._workspace_target(workspace, change["relative_path"])
        if not target.exists():
            raise ValueError("Applied target is missing; rollback stopped.")
        current_sha = hashlib.sha256(target.read_bytes()).hexdigest()
        if current_sha != change["post_apply_sha256"]:
            raise ValueError(
                "Target changed after Blue applied it; automatic rollback stopped."
            )
        if change["original_sha256"] == "MISSING":
            archive_dir = self.home / "change_backups" / change_id
            archive_dir.mkdir(parents=True, exist_ok=True)
            rollback_archive = archive_dir / f"{target.name}.created"
            rollback_archive.write_bytes(target.read_bytes())
            target.unlink()
        else:
            backup = Path(change["backup_path"])
            if not backup.is_file():
                raise ValueError("Original-file backup is missing.")
            temporary_name: str | None = None
            try:
                with tempfile.NamedTemporaryFile(
                    "wb",
                    dir=target.parent,
                    prefix=f".{target.name}.blue-rollback-",
                    suffix=".tmp",
                    delete=False,
                ) as temporary:
                    temporary.write(backup.read_bytes())
                    temporary.flush()
                    os.fsync(temporary.fileno())
                    temporary_name = temporary.name
                os.replace(temporary_name, target)
            finally:
                if temporary_name and Path(temporary_name).exists():
                    Path(temporary_name).unlink()
        self.storage.mark_change_rolled_back(change_id)
        self.record_execution_receipt(
            change["rollback_approval_id"],
            "succeeded",
            f"Rolled back change {change_id}",
            executor="blue_core",
        )
        self.storage.append_audit(
            actor="blue_core",
            action="change.rollback",
            target=change_id,
            result="success",
        )
        return target

    def export_signed_proposal(self, change_id: str, destination: Path) -> Path:
        self.ensure_initialized()
        change = self.storage.get_proposed_change(change_id)
        if change is None:
            raise ValueError(f"Proposed change not found: {change_id}")
        workspace = self.storage.get_workspace(change["workspace_id"])
        approval = self.storage.get_approval(change["approval_id"])
        payload = {
            "format": "project-blue-proposal",
            "version": 1,
            "change_id": change["id"],
            "workspace_id": change["workspace_id"],
            "workspace_name": workspace["name"] if workspace else None,
            "relative_path": change["relative_path"],
            "original_sha256": change["original_sha256"],
            "proposed_content": change["proposed_content"],
            "unified_diff": change["unified_diff"],
            "status": change["status"],
            "approval_id": change["approval_id"],
            "approval_status": approval["status"] if approval else None,
            "created_at": change["created_at"],
            "expires_at": change["expires_at"],
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        key = bytes.fromhex(self.storage.get_metadata("proposal_hmac_key"))
        signature = hmac.new(key, canonical.encode("utf-8"), hashlib.sha256).hexdigest()
        bundle = {
            "payload": payload,
            "signature_algorithm": "HMAC-SHA256",
            "signature": signature,
        }
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(bundle, indent=2) + "\n", encoding="utf-8"
        )
        self.storage.append_audit(
            actor="creator",
            action="proposal.export_signed",
            target=change_id,
            result="success",
            details={"destination": str(destination.resolve())},
        )
        return destination

    def verify_signed_proposal(self, bundle_path: Path) -> dict[str, Any]:
        self.ensure_initialized()
        bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
        payload = bundle.get("payload")
        signature = str(bundle.get("signature", ""))
        if not isinstance(payload, dict):
            raise ValueError("Proposal bundle payload is invalid.")
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        key = bytes.fromhex(self.storage.get_metadata("proposal_hmac_key"))
        expected = hmac.new(
            key, canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return {
            "bundle": str(bundle_path.resolve()),
            "algorithm": bundle.get("signature_algorithm"),
            "signature_valid": hmac.compare_digest(expected, signature),
            "change_id": payload.get("change_id"),
            "workspace_name": payload.get("workspace_name"),
            "relative_path": payload.get("relative_path"),
        }

    def configure_backup_verification_schedule(self, interval_hours: int) -> None:
        self.ensure_initialized()
        if not 1 <= interval_hours <= 720:
            raise ValueError("Backup verification interval must be 1–720 hours.")
        self.storage.set_metadata(
            "backup_verification_interval_hours", str(interval_hours)
        )
        self.storage.append_audit(
            actor="creator",
            action="maintenance.backup_schedule",
            target="backup_verification",
            result="success",
            details={"interval_hours": interval_hours},
        )

    def backup_maintenance_status(self) -> dict[str, Any]:
        self.ensure_initialized()
        interval = int(
            self.storage.get_metadata("backup_verification_interval_hours") or "24"
        )
        last = self.storage.get_metadata("last_backup_verification_at")
        due = True
        if last:
            last_time = datetime.fromisoformat(last)
            due = datetime.now(UTC) >= last_time + timedelta(hours=interval)
        return {
            "interval_hours": interval,
            "last_verified_at": last,
            "due": due,
            "verification_records": len(
                self.storage.list_backup_verifications(limit=1_000_000)
            ),
        }

    def run_backup_maintenance(
        self, backup_directory: Path, force: bool = False
    ) -> dict[str, Any]:
        self.ensure_initialized()
        status = self.backup_maintenance_status()
        if not force and not status["due"]:
            return {**status, "ran": False, "results": []}
        backup_directory = backup_directory.expanduser().resolve()
        if not backup_directory.is_dir():
            raise ValueError(f"Backup directory does not exist: {backup_directory}")
        results: list[dict[str, Any]] = []
        for backup_path in sorted(backup_directory.glob("*.db")):
            try:
                report = self.verify_backup(backup_path)
            except ValueError as exc:
                report = {
                    "backup": str(backup_path),
                    "checksum_match": False,
                    "integrity_check": str(exc),
                    "valid": False,
                }
            self.storage.add_backup_verification(
                str(backup_path),
                bool(report["checksum_match"]),
                str(report["integrity_check"]),
                bool(report["valid"]),
            )
            results.append(report)
        now = utc_now()
        self.storage.set_metadata("last_backup_verification_at", now)
        self.storage.append_audit(
            actor="system",
            action="maintenance.backup_verify",
            target=str(backup_directory),
            result="success" if all(row["valid"] for row in results) else "attention",
            details={"count": len(results)},
        )
        return {
            "ran": True,
            "verified_at": now,
            "results": results,
            "all_valid": bool(results) and all(row["valid"] for row in results),
        }

    def restore_drill(self, backup_path: Path) -> dict[str, Any]:
        backup_report = self.verify_backup(backup_path)
        if not backup_report["valid"]:
            return {**backup_report, "restore_drill": False}
        with tempfile.TemporaryDirectory(prefix="blue-restore-drill-") as directory:
            restored = Path(directory) / "restored.db"
            shutil.copy2(backup_path, restored)
            connection = sqlite3.connect(restored)
            try:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
                    )
                }
                required = {"metadata", "memories", "audit_events", "approvals"}
                integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            finally:
                connection.close()
        return {
            **backup_report,
            "restore_drill": integrity == "ok" and required.issubset(tables),
            "required_tables_present": required.issubset(tables),
            "table_count": len(tables),
        }

    def doctor(self) -> dict[str, Any]:
        self.ensure_initialized()
        self.storage.expire_changes()
        self.storage.expire_approvals()
        chain_ok, chain_message = self.storage.verify_audit_chain()
        stored_fingerprint = self.storage.get_metadata("constitution_fingerprint")
        return {
            "home": str(self.home),
            "database_exists": self.storage.database_path.exists(),
            "constitution_version": self.constitution.version,
            "constitution_match": stored_fingerprint == self.constitution.fingerprint,
            "provider": self.config.provider,
            "model": self.config.model if self.config.provider == "ollama" else None,
            "audit_chain_ok": chain_ok,
            "audit_message": chain_message,
            "projects": len(self.storage.list_projects()),
            "open_tasks": len(self.storage.list_tasks(status="open")),
            "pending_approvals": len(
                self.storage.list_approvals(status="pending")
            ),
            "conversation_history_enabled": self.config.save_conversations,
            "sources": len(self.storage.list_sources()),
            "conversations": len(self.storage.list_conversations()),
            "execution_receipts": len(
                self.storage.list_execution_receipts(limit=1_000_000)
            ),
            "search_engine": "sqlite_fts5"
            if self.storage.fts_enabled
            else "sqlite_like_fallback",
            "registered_workspaces": len(self.storage.list_workspaces()),
            "pending_file_changes": len(
                self.storage.list_proposed_changes(status="proposed")
            ),
            "backup_maintenance": self.backup_maintenance_status(),
            "principals": len(self.storage.list_principals()),
            "vault_entries": len(self.storage.list_secrets()),
            "forge_artifacts": len(self.storage.list_forge_artifacts()),
            "execution_runs": len(self.storage.list_execution_runs()),
            "academy_answers": len(self.storage.list_academy_answers()),
            "academy_lessons": len(self.storage.list_academy_lessons()),
            "laboratory_items": len(self.storage.list_laboratory_items()),
            "module_registry_version": self.capability_report()["version"],
        }

    def provider_status(self) -> dict[str, Any]:
        if self.config.provider == "offline":
            return {
                "provider": "offline",
                "available": True,
                "detail": "Offline foundation mode is available.",
            }
        request = urllib.request.Request(
            f"{self.config.ollama_url.rstrip('/')}/api/tags", method="GET"
        )
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            return {
                "provider": "ollama",
                "available": False,
                "detail": f"Local Ollama is unavailable: {exc}",
            }
        models = [
            item.get("name", "")
            for item in payload.get("models", [])
            if isinstance(item, dict)
        ]
        return {
            "provider": "ollama",
            "available": self.config.model in models
            or any(name.split(":")[0] == self.config.model for name in models),
            "configured_model": self.config.model,
            "installed_models": models,
            "detail": "Connected to local Ollama.",
        }

    def configure_local_model(self, model: str | None = None) -> dict[str, Any]:
        original_provider = self.config.provider
        self.config.provider = "ollama"
        status = self.provider_status()
        if not status["available"] and not status.get("installed_models"):
            self.config.provider = original_provider
            return {
                **status,
                "configured": False,
                "next_step": "Install/start Ollama and pull a model, then run this command again.",
            }
        selected = model or self.config.model
        installed = status.get("installed_models", [])
        matching = [
            name
            for name in installed
            if name == selected or name.split(":")[0] == selected
        ]
        if not matching and model is None and installed:
            matching = [installed[0]]
        if not matching:
            self.config.provider = original_provider
            return {
                **status,
                "configured": False,
                "next_step": f"Model '{selected}' is not installed in local Ollama.",
            }
        self.config.provider = "ollama"
        self.config.model = matching[0]
        save_config(self.home, self.config)
        return {
            **status,
            "configured": True,
            "configured_model": self.config.model,
            "next_step": "Local Ollama is ready for Blue chat.",
        }

    def update_config(self, key: str, value: str) -> None:
        if key == "provider":
            if value not in {"offline", "ollama"}:
                raise ValueError("Provider must be 'offline' or 'ollama'.")
            self.config.provider = value
        elif key == "model":
            if not value.strip():
                raise ValueError("Model cannot be empty.")
            self.config.model = value.strip()
        elif key == "ollama_url":
            if not value.startswith(("http://127.0.0.1", "http://localhost")):
                raise ValueError("Phase 1 only permits a local Ollama URL.")
            self.config.ollama_url = value.rstrip("/")
        elif key == "save_conversations":
            normalized = value.strip().lower()
            if normalized not in {"true", "false", "yes", "no", "1", "0"}:
                raise ValueError("save_conversations must be true or false.")
            self.config.save_conversations = normalized in {"true", "yes", "1"}
        else:
            raise ValueError(f"Unsupported configuration key: {key}")
        save_config(self.home, self.config)
