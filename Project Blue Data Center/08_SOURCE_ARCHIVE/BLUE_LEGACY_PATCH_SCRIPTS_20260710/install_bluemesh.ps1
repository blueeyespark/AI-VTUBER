$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\adahn\Downloads\AI-VTUBER-main\AI-VTUBER-main\Project Blue App"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-ProjectFile {
  param(
    [Parameter(Mandatory=$true)][string]$RelativePath,
    [Parameter(Mandatory=$true)][string]$Content
  )
  $Path = Join-Path $ProjectRoot $RelativePath
  $Directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $Directory)) {
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

Write-ProjectFile "src\blue_mesh\__init__.py" @'
"""BlueMesh: shared Project Blue identity replicated across trusted devices.

Blue may run on many creator PCs, but this package treats those PCs as nodes of
one shared identity instead of separate AIs.
"""

from .mesh import BlueMesh
from .prototype import run_first_working_prototype

__all__ = ["BlueMesh", "run_first_working_prototype"]
'@

Write-ProjectFile "src\blue_mesh\db.py" @'
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = 1


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def json_loads(value: str | None, default: Any = None) -> Any:
    if value in (None, ""):
        return default
    return json.loads(value)


class BlueMeshDatabase:
    """Small SQLite adapter with a schema that can later be moved to PostgreSQL."""

    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.connection: sqlite3.Connection | None = None

    def connect(self) -> sqlite3.Connection:
        if self.connection is None:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self.connection = sqlite3.connect(self.db_path)
            self.connection.row_factory = sqlite3.Row
            self.connection.execute("PRAGMA foreign_keys = ON")
            self.connection.execute("PRAGMA journal_mode = WAL")
            self.initialize()
        return self.connection

    def close(self) -> None:
        if self.connection is not None:
            self.connection.close()
            self.connection = None

    def __enter__(self) -> "BlueMeshDatabase":
        self.connect()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def initialize(self) -> None:
        conn = self.connection
        if conn is None:
            raise RuntimeError("Database is not connected")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS mesh_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO mesh_meta(key, value)
            VALUES ('schema_version', '1');

            CREATE TABLE IF NOT EXISTS blue_identity (
                blue_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                constitution_json TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS blue_creators (
                creator_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                contact_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS blue_nodes (
                node_id TEXT PRIMARY KEY,
                device_name TEXT NOT NULL,
                owner_creator_id TEXT NOT NULL,
                hardware_json TEXT NOT NULL,
                os_name TEXT NOT NULL,
                local_paths_json TEXT NOT NULL,
                online_status TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(owner_creator_id) REFERENCES blue_creators(creator_id)
            );

            CREATE TABLE IF NOT EXISTS trusted_devices (
                device_id TEXT PRIMARY KEY,
                node_id TEXT NOT NULL UNIQUE,
                trust_status TEXT NOT NULL,
                approved_by_creator_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(node_id) REFERENCES blue_nodes(node_id),
                FOREIGN KEY(approved_by_creator_id) REFERENCES blue_creators(creator_id)
            );

            CREATE TABLE IF NOT EXISTS blue_ledger (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                change_id TEXT NOT NULL UNIQUE,
                timestamp TEXT NOT NULL,
                node_id TEXT NOT NULL,
                creator_id TEXT NOT NULL,
                change_type TEXT NOT NULL,
                affected_module TEXT NOT NULL,
                before_state_json TEXT NOT NULL,
                after_state_json TEXT NOT NULL,
                approval_status TEXT NOT NULL,
                previous_hash TEXT,
                entry_hash TEXT NOT NULL,
                FOREIGN KEY(node_id) REFERENCES blue_nodes(node_id),
                FOREIGN KEY(creator_id) REFERENCES blue_creators(creator_id)
            );

            CREATE TRIGGER IF NOT EXISTS blue_ledger_no_update
            BEFORE UPDATE ON blue_ledger
            BEGIN
                SELECT RAISE(ABORT, 'blue_ledger is append-only');
            END;

            CREATE TRIGGER IF NOT EXISTS blue_ledger_no_delete
            BEFORE DELETE ON blue_ledger
            BEGIN
                SELECT RAISE(ABORT, 'blue_ledger is append-only');
            END;

            CREATE TABLE IF NOT EXISTS shared_state (
                state_id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                record_key TEXT NOT NULL,
                value_json TEXT NOT NULL,
                version INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by_node_id TEXT NOT NULL,
                updated_by_creator_id TEXT NOT NULL,
                approval_status TEXT NOT NULL,
                previous_state_json TEXT,
                UNIQUE(scope, record_key),
                FOREIGN KEY(updated_by_node_id) REFERENCES blue_nodes(node_id),
                FOREIGN KEY(updated_by_creator_id) REFERENCES blue_creators(creator_id)
            );

            CREATE TABLE IF NOT EXISTS sync_events (
                event_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT,
                channel TEXT NOT NULL,
                status TEXT NOT NULL,
                details_json TEXT NOT NULL,
                FOREIGN KEY(source_node_id) REFERENCES blue_nodes(node_id)
            );

            CREATE TABLE IF NOT EXISTS conflicts (
                conflict_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                scope TEXT NOT NULL,
                record_key TEXT NOT NULL,
                base_version INTEGER,
                current_version INTEGER NOT NULL,
                version_a_json TEXT NOT NULL,
                version_b_json TEXT NOT NULL,
                node_a_id TEXT NOT NULL,
                node_b_id TEXT NOT NULL,
                creator_a_id TEXT NOT NULL,
                creator_b_id TEXT NOT NULL,
                report_json TEXT NOT NULL,
                report_text TEXT NOT NULL,
                status TEXT NOT NULL,
                resolution_json TEXT,
                FOREIGN KEY(node_a_id) REFERENCES blue_nodes(node_id),
                FOREIGN KEY(node_b_id) REFERENCES blue_nodes(node_id),
                FOREIGN KEY(creator_a_id) REFERENCES blue_creators(creator_id),
                FOREIGN KEY(creator_b_id) REFERENCES blue_creators(creator_id)
            );

            CREATE TABLE IF NOT EXISTS local_agent_capabilities (
                capability_id TEXT PRIMARY KEY,
                node_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(node_id, name),
                FOREIGN KEY(node_id) REFERENCES blue_nodes(node_id)
            );
            """
        )
        conn.commit()

    def execute(self, statement: str, parameters: Iterable[Any] = ()) -> sqlite3.Cursor:
        cursor = self.connect().execute(statement, tuple(parameters))
        self.connect().commit()
        return cursor

    def fetch_one(self, statement: str, parameters: Iterable[Any] = ()) -> sqlite3.Row | None:
        return self.connect().execute(statement, tuple(parameters)).fetchone()

    def fetch_all(self, statement: str, parameters: Iterable[Any] = ()) -> list[sqlite3.Row]:
        return list(self.connect().execute(statement, tuple(parameters)).fetchall())

    def row_to_dict(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {key: row[key] for key in row.keys()}
'@

Write-ProjectFile "src\blue_mesh\identity\__init__.py" @'
from __future__ import annotations

from typing import Any

from ..db import BlueMeshDatabase, json_dumps, json_loads, new_id, utc_now


DEFAULT_BLUE_ID = "blue-shared-identity"
DEFAULT_CONSTITUTION = {
    "identity_rule": "Blue may have many devices, but only one identity.",
    "safety_rule": "Sensitive changes require creator approval.",
    "sync_rule": "Trusted nodes sync state without blindly overwriting each other.",
}


class BlueIdentity:
    """Stores Blue's single shared identity, creators, and trusted devices."""

    def __init__(self, database: BlueMeshDatabase):
        self.database = database

    def create_shared_identity(
        self,
        blue_id: str = DEFAULT_BLUE_ID,
        display_name: str = "Project Blue",
        constitution: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        existing = self.get_identity(blue_id)
        if existing:
            return existing
        now = utc_now()
        constitution = constitution or DEFAULT_CONSTITUTION
        metadata = {
            "core_identity": "one shared AI identity replicated across trusted creator devices",
            "storage": "sqlite-local-first",
            **(metadata or {}),
        }
        self.database.execute(
            """
            INSERT INTO blue_identity
            (blue_id, display_name, constitution_json, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (blue_id, display_name, json_dumps(constitution), json_dumps(metadata), now, now),
        )
        return self.get_identity(blue_id) or {}

    def get_identity(self, blue_id: str = DEFAULT_BLUE_ID) -> dict[str, Any] | None:
        row = self.database.fetch_one("SELECT * FROM blue_identity WHERE blue_id = ?", (blue_id,))
        if row is None:
            return None
        return {
            "blue_id": row["blue_id"],
            "display_name": row["display_name"],
            "constitution": json_loads(row["constitution_json"], {}),
            "metadata": json_loads(row["metadata_json"], {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "creators": self.list_creators(),
            "trusted_devices": self.list_trusted_devices(),
        }

    def add_creator(
        self,
        creator_id: str,
        display_name: str,
        role: str,
        contact: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        self.database.execute(
            """
            INSERT INTO blue_creators
            (creator_id, display_name, role, contact_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(creator_id) DO UPDATE SET
                display_name = excluded.display_name,
                role = excluded.role,
                contact_json = excluded.contact_json,
                updated_at = excluded.updated_at
            """,
            (creator_id, display_name, role, json_dumps(contact or {}), now, now),
        )
        return self.get_creator(creator_id) or {}

    def get_creator(self, creator_id: str) -> dict[str, Any] | None:
        row = self.database.fetch_one("SELECT * FROM blue_creators WHERE creator_id = ?", (creator_id,))
        if row is None:
            return None
        return {
            "creator_id": row["creator_id"],
            "display_name": row["display_name"],
            "role": row["role"],
            "contact": json_loads(row["contact_json"], {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_creators(self) -> list[dict[str, Any]]:
        rows = self.database.fetch_all("SELECT * FROM blue_creators ORDER BY created_at, creator_id")
        return [self.get_creator(row["creator_id"]) or {} for row in rows]

    def trust_device(
        self,
        node_id: str,
        approved_by_creator_id: str,
        trust_status: str = "trusted",
        device_id: str | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        device_id = device_id or new_id("trusted_device")
        self.database.execute(
            """
            INSERT INTO trusted_devices
            (device_id, node_id, trust_status, approved_by_creator_id, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(node_id) DO UPDATE SET
                trust_status = excluded.trust_status,
                approved_by_creator_id = excluded.approved_by_creator_id
            """,
            (device_id, node_id, trust_status, approved_by_creator_id, now),
        )
        row = self.database.fetch_one("SELECT * FROM trusted_devices WHERE node_id = ?", (node_id,))
        return dict(row) if row else {}

    def list_trusted_devices(self) -> list[dict[str, Any]]:
        rows = self.database.fetch_all(
            "SELECT * FROM trusted_devices ORDER BY created_at, node_id"
        )
        return [dict(row) for row in rows]
'@

Write-ProjectFile "src\blue_mesh\node\__init__.py" @'
from __future__ import annotations

import platform
from typing import Any

from ..db import BlueMeshDatabase, json_dumps, json_loads, new_id, utc_now


class BlueNode:
    """Represents a PC running Blue as one trusted node in the shared identity."""

    def __init__(self, database: BlueMeshDatabase):
        self.database = database

    def register_node(
        self,
        device_name: str,
        owner_creator_id: str,
        hardware: dict[str, Any] | None = None,
        os_name: str | None = None,
        local_paths: dict[str, str] | None = None,
        node_id: str | None = None,
    ) -> dict[str, Any]:
        node_id = node_id or new_id("node")
        now = utc_now()
        hardware = hardware or {
            "machine": platform.machine(),
            "processor": platform.processor(),
            "python": platform.python_version(),
        }
        os_name = os_name or f"{platform.system()} {platform.release()}".strip()
        self.database.execute(
            """
            INSERT INTO blue_nodes
            (node_id, device_name, owner_creator_id, hardware_json, os_name,
             local_paths_json, online_status, last_seen_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'online', ?, ?, ?)
            ON CONFLICT(node_id) DO UPDATE SET
                device_name = excluded.device_name,
                owner_creator_id = excluded.owner_creator_id,
                hardware_json = excluded.hardware_json,
                os_name = excluded.os_name,
                local_paths_json = excluded.local_paths_json,
                online_status = excluded.online_status,
                last_seen_at = excluded.last_seen_at,
                updated_at = excluded.updated_at
            """,
            (
                node_id,
                device_name,
                owner_creator_id,
                json_dumps(hardware),
                os_name,
                json_dumps(local_paths or {}),
                now,
                now,
                now,
            ),
        )
        return self.get_node(node_id) or {}

    def set_online_status(self, node_id: str, status: str) -> None:
        now = utc_now()
        self.database.execute(
            "UPDATE blue_nodes SET online_status = ?, last_seen_at = ?, updated_at = ? WHERE node_id = ?",
            (status, now, now, node_id),
        )

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        row = self.database.fetch_one("SELECT * FROM blue_nodes WHERE node_id = ?", (node_id,))
        if row is None:
            return None
        return {
            "node_id": row["node_id"],
            "device_name": row["device_name"],
            "owner_creator_id": row["owner_creator_id"],
            "hardware": json_loads(row["hardware_json"], {}),
            "os_name": row["os_name"],
            "local_paths": json_loads(row["local_paths_json"], {}),
            "online_status": row["online_status"],
            "last_seen_at": row["last_seen_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_nodes(self) -> list[dict[str, Any]]:
        rows = self.database.fetch_all("SELECT node_id FROM blue_nodes ORDER BY created_at, node_id")
        return [self.get_node(row["node_id"]) or {} for row in rows]
'@

Write-ProjectFile "src\blue_mesh\ledger\__init__.py" @'
from __future__ import annotations

import hashlib
from typing import Any

from ..db import BlueMeshDatabase, json_dumps, json_loads, new_id, utc_now


class BlueLedger:
    """Append-only change log for BlueMesh sync, approvals, and conflicts."""

    def __init__(self, database: BlueMeshDatabase):
        self.database = database

    def append_change(
        self,
        node_id: str,
        creator_id: str,
        change_type: str,
        affected_module: str,
        before_state: Any,
        after_state: Any,
        approval_status: str = "approved",
        change_id: str | None = None,
    ) -> dict[str, Any]:
        previous = self.database.fetch_one(
            "SELECT entry_hash FROM blue_ledger ORDER BY sequence DESC LIMIT 1"
        )
        previous_hash = previous["entry_hash"] if previous else None
        change_id = change_id or new_id("change")
        timestamp = utc_now()
        entry_for_hash = {
            "change_id": change_id,
            "timestamp": timestamp,
            "node_id": node_id,
            "creator_id": creator_id,
            "change_type": change_type,
            "affected_module": affected_module,
            "before_state": before_state,
            "after_state": after_state,
            "approval_status": approval_status,
            "previous_hash": previous_hash,
        }
        entry_hash = hashlib.sha256(json_dumps(entry_for_hash).encode("utf-8")).hexdigest()
        self.database.execute(
            """
            INSERT INTO blue_ledger
            (change_id, timestamp, node_id, creator_id, change_type, affected_module,
             before_state_json, after_state_json, approval_status, previous_hash, entry_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                change_id,
                timestamp,
                node_id,
                creator_id,
                change_type,
                affected_module,
                json_dumps(before_state),
                json_dumps(after_state),
                approval_status,
                previous_hash,
                entry_hash,
            ),
        )
        return self.get_change(change_id) or {}

    def get_change(self, change_id: str) -> dict[str, Any] | None:
        row = self.database.fetch_one("SELECT * FROM blue_ledger WHERE change_id = ?", (change_id,))
        return self._row(row) if row else None

    def list_changes(self) -> list[dict[str, Any]]:
        rows = self.database.fetch_all("SELECT * FROM blue_ledger ORDER BY sequence")
        return [self._row(row) for row in rows]

    def verify_chain(self) -> tuple[bool, str]:
        previous_hash = None
        for entry in self.list_changes():
            if entry["previous_hash"] != previous_hash:
                return False, f"Ledger hash chain break at {entry['change_id']}"
            entry_for_hash = {
                "change_id": entry["change_id"],
                "timestamp": entry["timestamp"],
                "node_id": entry["node_id"],
                "creator_id": entry["creator_id"],
                "change_type": entry["change_type"],
                "affected_module": entry["affected_module"],
                "before_state": entry["before_state"],
                "after_state": entry["after_state"],
                "approval_status": entry["approval_status"],
                "previous_hash": entry["previous_hash"],
            }
            expected = hashlib.sha256(json_dumps(entry_for_hash).encode("utf-8")).hexdigest()
            if expected != entry["entry_hash"]:
                return False, f"Ledger entry hash mismatch at {entry['change_id']}"
            previous_hash = entry["entry_hash"]
        return True, "Ledger chain verified"

    def _row(self, row: Any) -> dict[str, Any]:
        return {
            "sequence": row["sequence"],
            "change_id": row["change_id"],
            "timestamp": row["timestamp"],
            "node_id": row["node_id"],
            "creator_id": row["creator_id"],
            "change_type": row["change_type"],
            "affected_module": row["affected_module"],
            "before_state": json_loads(row["before_state_json"], {}),
            "after_state": json_loads(row["after_state_json"], {}),
            "approval_status": row["approval_status"],
            "previous_hash": row["previous_hash"],
            "entry_hash": row["entry_hash"],
        }
'@

Write-ProjectFile "src\blue_mesh\trust\__init__.py" @'
from __future__ import annotations


class BlueTrust:
    """Role and approval rules for a shared Blue identity."""

    ROLE_PERMISSIONS = {
        "Creator": {"approve_sensitive", "write_memory", "write_code", "manage_nodes", "view"},
        "Co-Creator": {"approve_sensitive", "write_memory", "write_code", "manage_nodes", "view"},
        "Steward": {"write_memory", "manage_nodes", "view"},
        "Contributor": {"write_memory", "view"},
        "Viewer": {"view"},
    }
    SENSITIVE_MODULES = {"constitution", "identity", "trusted_devices", "permissions"}
    APPROVAL_REQUIRED_SCOPES = {"constitution", "identity"}

    def can(self, role: str, permission: str) -> bool:
        return permission in self.ROLE_PERMISSIONS.get(role, set())

    def requires_approval(self, change_type: str, affected_module: str, is_overwrite: bool = False) -> bool:
        module = affected_module.lower()
        if module in self.SENSITIVE_MODULES:
            return True
        if is_overwrite and module in {"memory", "personality", "settings", "routines"}:
            return True
        if change_type.lower() in {"delete", "rollback", "constitution_update"}:
            return True
        return False

    def validate_sync_path(self, path: str) -> tuple[bool, str]:
        normalized = path.replace("\\", "/").lower()
        blocked_names = {".env", ".env.local", ".env.production"}
        if normalized.split("/")[-1] in blocked_names:
            return False, "Never sync .env files."
        if "/.git/" in normalized or normalized.endswith("/.git"):
            return False, "Never sync Git internals."
        if "token" in normalized or "secret" in normalized:
            return False, "Potential token/secret path requires manual review."
        return True, "Path allowed for normal sync."
'@

Write-ProjectFile "src\blue_mesh\conflict\__init__.py" @'
from __future__ import annotations

from typing import Any

from ..db import BlueMeshDatabase, json_dumps, json_loads, new_id, utc_now
from ..ledger import BlueLedger


CONFLICT_OPTIONS = ["keep_version_a", "keep_version_b", "merge_both", "manual_review_task"]


class BlueConflictResolver:
    """Detects and records cases where trusted nodes edited the same record."""

    def __init__(self, database: BlueMeshDatabase, ledger: BlueLedger):
        self.database = database
        self.ledger = ledger

    def create_conflict(
        self,
        scope: str,
        record_key: str,
        base_version: int | None,
        current_version: int,
        version_a: dict[str, Any],
        version_b: dict[str, Any],
        node_a_id: str,
        node_b_id: str,
        creator_a_id: str,
        creator_b_id: str,
    ) -> dict[str, Any]:
        conflict_id = new_id("conflict")
        created_at = utc_now()
        report = {
            "conflict_id": conflict_id,
            "scope": scope,
            "record_key": record_key,
            "base_version": base_version,
            "current_version": current_version,
            "options": CONFLICT_OPTIONS,
            "summary": "Two trusted Blue nodes edited the same shared record from different versions.",
        }
        report_text = self.render_report(report, version_a, version_b)
        self.database.execute(
            """
            INSERT INTO conflicts
            (conflict_id, created_at, scope, record_key, base_version, current_version,
             version_a_json, version_b_json, node_a_id, node_b_id, creator_a_id, creator_b_id,
             report_json, report_text, status, resolution_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL)
            """,
            (
                conflict_id,
                created_at,
                scope,
                record_key,
                base_version,
                current_version,
                json_dumps(version_a),
                json_dumps(version_b),
                node_a_id,
                node_b_id,
                creator_a_id,
                creator_b_id,
                json_dumps(report),
                report_text,
            ),
        )
        self.ledger.append_change(
            node_id=node_b_id,
            creator_id=creator_b_id,
            change_type="conflict_detected",
            affected_module=f"{scope}:{record_key}",
            before_state=version_a,
            after_state={"proposed": version_b, "conflict_id": conflict_id},
            approval_status="manual_review_required",
        )
        return self.get_conflict(conflict_id) or {}

    def get_conflict(self, conflict_id: str) -> dict[str, Any] | None:
        row = self.database.fetch_one("SELECT * FROM conflicts WHERE conflict_id = ?", (conflict_id,))
        if row is None:
            return None
        return {
            "conflict_id": row["conflict_id"],
            "created_at": row["created_at"],
            "scope": row["scope"],
            "record_key": row["record_key"],
            "base_version": row["base_version"],
            "current_version": row["current_version"],
            "version_a": json_loads(row["version_a_json"], {}),
            "version_b": json_loads(row["version_b_json"], {}),
            "node_a_id": row["node_a_id"],
            "node_b_id": row["node_b_id"],
            "creator_a_id": row["creator_a_id"],
            "creator_b_id": row["creator_b_id"],
            "report": json_loads(row["report_json"], {}),
            "report_text": row["report_text"],
            "status": row["status"],
            "resolution": json_loads(row["resolution_json"], None),
        }

    def list_conflicts(self, status: str | None = None) -> list[dict[str, Any]]:
        if status:
            rows = self.database.fetch_all("SELECT conflict_id FROM conflicts WHERE status = ? ORDER BY created_at", (status,))
        else:
            rows = self.database.fetch_all("SELECT conflict_id FROM conflicts ORDER BY created_at")
        return [self.get_conflict(row["conflict_id"]) or {} for row in rows]

    def resolve_conflict(self, conflict_id: str, choice: str, creator_id: str, notes: str = "") -> dict[str, Any]:
        if choice not in CONFLICT_OPTIONS:
            raise ValueError(f"Unsupported conflict choice: {choice}")
        conflict = self.get_conflict(conflict_id)
        if not conflict:
            raise KeyError(conflict_id)
        resolution = {"choice": choice, "creator_id": creator_id, "notes": notes, "resolved_at": utc_now()}
        self.database.execute(
            "UPDATE conflicts SET status = 'resolved', resolution_json = ? WHERE conflict_id = ?",
            (json_dumps(resolution), conflict_id),
        )
        return self.get_conflict(conflict_id) or {}

    def render_report(self, report: dict[str, Any], version_a: dict[str, Any], version_b: dict[str, Any]) -> str:
        lines = [
            f"# BlueMesh Conflict Report: {report['conflict_id']}",
            "",
            f"- Record: `{report['scope']}:{report['record_key']}`",
            f"- Base version: `{report['base_version']}`",
            f"- Current version: `{report['current_version']}`",
            "",
            "## Creator choices",
            "",
            "- keep version A",
            "- keep version B",
            "- merge both",
            "- create manual review task",
            "",
            "## Version A",
            "",
            json_dumps(version_a),
            "",
            "## Version B",
            "",
            json_dumps(version_b),
        ]
        return "\n".join(lines)
'@

Write-ProjectFile "src\blue_mesh\sync\__init__.py" @'
from __future__ import annotations

from typing import Any

from ..conflict import BlueConflictResolver
from ..db import BlueMeshDatabase, json_dumps, json_loads, new_id, utc_now
from ..ledger import BlueLedger
from ..trust import BlueTrust


SYNC_SCOPES = {
    "memory",
    "personality",
    "settings",
    "routines",
    "modules",
    "project_status",
    "documentation",
    "local_agent_capabilities",
    "constitution",
}


class BlueSync:
    """Versioned shared-state sync that refuses blind overwrites."""

    def __init__(
        self,
        database: BlueMeshDatabase,
        ledger: BlueLedger,
        conflict_resolver: BlueConflictResolver,
        trust: BlueTrust,
    ):
        self.database = database
        self.ledger = ledger
        self.conflict_resolver = conflict_resolver
        self.trust = trust

    def get_record(self, scope: str, record_key: str) -> dict[str, Any] | None:
        row = self.database.fetch_one(
            "SELECT * FROM shared_state WHERE scope = ? AND record_key = ?",
            (scope, record_key),
        )
        if row is None:
            return None
        return {
            "state_id": row["state_id"],
            "scope": row["scope"],
            "record_key": row["record_key"],
            "value": json_loads(row["value_json"], {}),
            "version": row["version"],
            "updated_at": row["updated_at"],
            "updated_by_node_id": row["updated_by_node_id"],
            "updated_by_creator_id": row["updated_by_creator_id"],
            "approval_status": row["approval_status"],
            "previous_state": json_loads(row["previous_state_json"], None),
        }

    def write_record(
        self,
        scope: str,
        record_key: str,
        value: dict[str, Any],
        node_id: str,
        creator_id: str,
        expected_version: int | None = None,
        approval_status: str = "approved",
    ) -> dict[str, Any]:
        if scope not in SYNC_SCOPES:
            raise ValueError(f"Unsupported sync scope: {scope}")
        current = self.get_record(scope, record_key)
        is_overwrite = current is not None

        if (
            current
            and expected_version is not None
            and current["version"] != expected_version
        ):
            conflict = self.conflict_resolver.create_conflict(
                scope=scope,
                record_key=record_key,
                base_version=expected_version,
                current_version=current["version"],
                version_a=current,
                version_b={
                    "scope": scope,
                    "record_key": record_key,
                    "value": value,
                    "expected_version": expected_version,
                    "node_id": node_id,
                    "creator_id": creator_id,
                },
                node_a_id=current["updated_by_node_id"],
                node_b_id=node_id,
                creator_a_id=current["updated_by_creator_id"],
                creator_b_id=creator_id,
            )
            return {"status": "conflict", "conflict": conflict}

        if self.trust.requires_approval("write", scope, is_overwrite) and approval_status != "approved":
            self.ledger.append_change(
                node_id=node_id,
                creator_id=creator_id,
                change_type="approval_required",
                affected_module=scope,
                before_state=current,
                after_state=value,
                approval_status="pending",
            )
            return {
                "status": "approval_required",
                "reason": "Sensitive or overwrite sync requires approval.",
                "record": current,
            }

        now = utc_now()
        state_id = current["state_id"] if current else new_id("state")
        version = (current["version"] + 1) if current else 1
        previous_state_json = json_dumps(current) if current else None
        self.database.execute(
            """
            INSERT INTO shared_state
            (state_id, scope, record_key, value_json, version, updated_at,
             updated_by_node_id, updated_by_creator_id, approval_status, previous_state_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope, record_key) DO UPDATE SET
                value_json = excluded.value_json,
                version = excluded.version,
                updated_at = excluded.updated_at,
                updated_by_node_id = excluded.updated_by_node_id,
                updated_by_creator_id = excluded.updated_by_creator_id,
                approval_status = excluded.approval_status,
                previous_state_json = excluded.previous_state_json
            """,
            (
                state_id,
                scope,
                record_key,
                json_dumps(value),
                version,
                now,
                node_id,
                creator_id,
                approval_status,
                previous_state_json,
            ),
        )
        updated = self.get_record(scope, record_key)
        self.ledger.append_change(
            node_id=node_id,
            creator_id=creator_id,
            change_type="sync_write",
            affected_module=f"{scope}:{record_key}",
            before_state=current,
            after_state=updated,
            approval_status=approval_status,
        )
        return {"status": "synced", "record": updated}

    def sync_memory(
        self,
        memory_id: str,
        text: str,
        node_id: str,
        creator_id: str,
        expected_version: int | None = None,
        approval_status: str = "approved",
        tags: list[str] | None = None,
    ) -> dict[str, Any]:
        return self.write_record(
            "memory",
            memory_id,
            {"text": text, "tags": tags or []},
            node_id=node_id,
            creator_id=creator_id,
            expected_version=expected_version,
            approval_status=approval_status,
        )

    def record_sync_event(
        self,
        source_node_id: str,
        target_node_id: str | None,
        channel: str,
        status: str,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        event_id = new_id("sync_event")
        self.database.execute(
            """
            INSERT INTO sync_events
            (event_id, timestamp, source_node_id, target_node_id, channel, status, details_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, utc_now(), source_node_id, target_node_id, channel, status, json_dumps(details or {})),
        )
        row = self.database.fetch_one("SELECT * FROM sync_events WHERE event_id = ?", (event_id,))
        return dict(row) if row else {}

    def validate_path_for_sync(self, path: str) -> tuple[bool, str]:
        return self.trust.validate_sync_path(path)
'@

Write-ProjectFile "src\blue_mesh\relay\__init__.py" @'
from __future__ import annotations

from typing import Any

from ..db import BlueMeshDatabase
from ..sync import BlueSync


class BlueMeshRelay:
    """Relay abstraction for LAN, Wi-Fi, internet relay, and offline re-sync.

    The first prototype records relay events locally. Network transport can be
    swapped in later without changing BlueSync's conflict rules.
    """

    def __init__(self, database: BlueMeshDatabase, sync: BlueSync):
        self.database = database
        self.sync = sync

    def log_lan_sync(self, source_node_id: str, target_node_id: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.sync.record_sync_event(source_node_id, target_node_id, "lan", "recorded", details)

    def log_internet_relay_sync(self, source_node_id: str, target_node_id: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.sync.record_sync_event(source_node_id, target_node_id, "internet_relay", "recorded", details)

    def log_offline_queue(self, source_node_id: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.sync.record_sync_event(source_node_id, None, "offline_queue", "queued", details)
'@

Write-ProjectFile "src\blue_mesh\local_agent\__init__.py" @'
from __future__ import annotations

from typing import Any

from ..db import BlueMeshDatabase, new_id, utc_now


class LocalAgentRegistry:
    """Tracks PC-specific abilities without pretending every node can do them."""

    def __init__(self, database: BlueMeshDatabase):
        self.database = database

    def register_capability(
        self,
        node_id: str,
        name: str,
        description: str,
        risk_level: str = "low",
        enabled: bool = True,
    ) -> dict[str, Any]:
        capability_id = new_id("capability")
        self.database.execute(
            """
            INSERT INTO local_agent_capabilities
            (capability_id, node_id, name, description, risk_level, enabled, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id, name) DO UPDATE SET
                description = excluded.description,
                risk_level = excluded.risk_level,
                enabled = excluded.enabled,
                updated_at = excluded.updated_at
            """,
            (capability_id, node_id, name, description, risk_level, 1 if enabled else 0, utc_now()),
        )
        return self.get_capability(node_id, name) or {}

    def get_capability(self, node_id: str, name: str) -> dict[str, Any] | None:
        row = self.database.fetch_one(
            "SELECT * FROM local_agent_capabilities WHERE node_id = ? AND name = ?",
            (node_id, name),
        )
        if row is None:
            return None
        return {
            "capability_id": row["capability_id"],
            "node_id": row["node_id"],
            "name": row["name"],
            "description": row["description"],
            "risk_level": row["risk_level"],
            "enabled": bool(row["enabled"]),
            "updated_at": row["updated_at"],
        }

    def list_capabilities(self, node_id: str | None = None) -> list[dict[str, Any]]:
        if node_id:
            rows = self.database.fetch_all(
                "SELECT node_id, name FROM local_agent_capabilities WHERE node_id = ? ORDER BY name",
                (node_id,),
            )
        else:
            rows = self.database.fetch_all(
                "SELECT node_id, name FROM local_agent_capabilities ORDER BY node_id, name"
            )
        return [self.get_capability(row["node_id"], row["name"]) or {} for row in rows]
'@

Write-ProjectFile "src\blue_mesh\update_manager\__init__.py" @'
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


class BlueUpdateManager:
    """GitHub-aware update planner with approval and rollback guardrails."""

    def __init__(self, repo_path: str | Path):
        self.repo_path = Path(repo_path)

    def _git(self, *args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=self.repo_path,
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def local_head(self) -> str:
        return self._git("rev-parse", "HEAD")

    def tracking_head(self, branch: str = "origin/main") -> str:
        return self._git("rev-parse", branch)

    def check_version(self, branch: str = "origin/main") -> dict[str, Any]:
        local = self.local_head()
        remote = self.tracking_head(branch)
        return {
            "local_head": local,
            "remote_head": remote,
            "update_available": local != remote,
            "branch": branch,
        }

    def plan_pull(self, approval_status: str) -> dict[str, Any]:
        if approval_status != "approved":
            return {
                "status": "approval_required",
                "reason": "Pulling code updates can change Blue behavior.",
            }
        return {
            "status": "ready",
            "commands": [["git", "fetch", "origin"], ["git", "pull", "--ff-only"]],
        }

    def plan_rollback(self, stable_revision: str, approval_status: str) -> dict[str, Any]:
        if approval_status != "approved":
            return {
                "status": "approval_required",
                "reason": "Rollback changes code state and requires creator approval.",
            }
        return {
            "status": "ready",
            "stable_revision": stable_revision,
            "commands": [["git", "checkout", stable_revision]],
        }
'@

Write-ProjectFile "src\blue_mesh\mesh.py" @'
from __future__ import annotations

from pathlib import Path

from .conflict import BlueConflictResolver
from .db import BlueMeshDatabase
from .identity import BlueIdentity
from .ledger import BlueLedger
from .local_agent import LocalAgentRegistry
from .node import BlueNode
from .relay import BlueMeshRelay
from .sync import BlueSync
from .trust import BlueTrust


class BlueMesh:
    """Facade for one shared Blue identity across many trusted local nodes."""

    def __init__(self, db_path: str | Path):
        self.database = BlueMeshDatabase(db_path)
        self.database.connect()
        self.identity = BlueIdentity(self.database)
        self.node = BlueNode(self.database)
        self.ledger = BlueLedger(self.database)
        self.trust = BlueTrust()
        self.conflicts = BlueConflictResolver(self.database, self.ledger)
        self.sync = BlueSync(self.database, self.ledger, self.conflicts, self.trust)
        self.relay = BlueMeshRelay(self.database, self.sync)
        self.local_agent = LocalAgentRegistry(self.database)

    def close(self) -> None:
        self.database.close()

    def __enter__(self) -> "BlueMesh":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
'@

Write-ProjectFile "src\blue_mesh\prototype.py" @'
from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Any

from .mesh import BlueMesh


def run_first_working_prototype(db_path: str | Path | None = None) -> dict[str, Any]:
    """Register two nodes, sync memory, detect a conflict, and return the report."""

    if db_path is None:
        db_path = Path(tempfile.mkdtemp(prefix="blue_mesh_")) / "blue_mesh.db"

    mesh = BlueMesh(db_path)
    try:
        identity = mesh.identity.create_shared_identity()
        creator_a = mesh.identity.add_creator("creator-adahn", "Adahn", "Creator")
        creator_b = mesh.identity.add_creator("creator-qwen", "Qwen", "Co-Creator")
        node_a = mesh.node.register_node(
            "Blue Node A",
            creator_a["creator_id"],
            hardware={"kind": "prototype"},
            os_name="local-prototype",
            local_paths={"project": "node-a/project-blue"},
            node_id="node-a",
        )
        node_b = mesh.node.register_node(
            "Blue Node B",
            creator_b["creator_id"],
            hardware={"kind": "prototype"},
            os_name="local-prototype",
            local_paths={"project": "node-b/project-blue"},
            node_id="node-b",
        )
        mesh.identity.trust_device(node_a["node_id"], creator_a["creator_id"])
        mesh.identity.trust_device(node_b["node_id"], creator_a["creator_id"])
        mesh.local_agent.register_capability(
            node_a["node_id"],
            "desktop_control",
            "Can help with approved low-risk actions on this PC.",
            "medium",
        )
        mesh.local_agent.register_capability(
            node_b["node_id"],
            "project_sync",
            "Can sync trusted Blue project state from the second creator PC.",
            "low",
        )

        seed = mesh.sync.sync_memory(
            "prototype.shared_memory",
            "Blue is one shared identity across trusted devices.",
            node_a["node_id"],
            creator_a["creator_id"],
        )
        base_version = seed["record"]["version"]
        edit_a = mesh.sync.sync_memory(
            "prototype.shared_memory",
            "Node A says Blue should remember that creators sync carefully.",
            node_a["node_id"],
            creator_a["creator_id"],
            expected_version=base_version,
            approval_status="approved",
        )
        edit_b = mesh.sync.sync_memory(
            "prototype.shared_memory",
            "Node B says Blue should remember that Wi-Fi sync is allowed for trusted PCs.",
            node_b["node_id"],
            creator_b["creator_id"],
            expected_version=base_version,
            approval_status="approved",
        )
        mesh.relay.log_lan_sync(node_a["node_id"], node_b["node_id"], {"record": "prototype.shared_memory"})
        ledger_ok, ledger_message = mesh.ledger.verify_chain()
        return {
            "database": str(db_path),
            "identity": identity,
            "nodes": [node_a, node_b],
            "seed_memory": seed,
            "node_a_update": edit_a,
            "node_b_update": edit_b,
            "conflict_detected": edit_b["status"] == "conflict",
            "conflict_report": edit_b.get("conflict", {}).get("report_text", ""),
            "ledger_verified": ledger_ok,
            "ledger_message": ledger_message,
            "ledger_entries": mesh.ledger.list_changes(),
        }
    finally:
        mesh.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the BlueMesh two-node prototype.")
    parser.add_argument("--db", type=Path, default=None, help="SQLite database path.")
    args = parser.parse_args()
    result = run_first_working_prototype(args.db)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
'@

Write-ProjectFile "tests\test_blue_mesh.py" @'
import tempfile
import unittest
from pathlib import Path

from blue_mesh import BlueMesh, run_first_working_prototype


class BlueMeshPrototypeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "blue_mesh.db"

    def tearDown(self):
        self.temp.cleanup()

    def test_first_working_prototype(self):
        result = run_first_working_prototype(self.db_path)
        self.assertEqual("blue-shared-identity", result["identity"]["blue_id"])
        self.assertEqual(2, len(result["nodes"]))
        self.assertTrue(result["conflict_detected"])
        self.assertIn("keep version A", result["conflict_report"])
        self.assertIn("merge both", result["conflict_report"])
        self.assertTrue(result["ledger_verified"], result["ledger_message"])
        self.assertGreaterEqual(len(result["ledger_entries"]), 3)

    def test_sensitive_overwrite_requires_approval(self):
        with BlueMesh(self.db_path) as mesh:
            mesh.identity.create_shared_identity()
            creator = mesh.identity.add_creator("creator", "Creator", "Creator")
            node = mesh.node.register_node("Node", creator["creator_id"], node_id="node")
            first = mesh.sync.sync_memory("m1", "Initial.", node["node_id"], creator["creator_id"])
            self.assertEqual("synced", first["status"])
            second = mesh.sync.sync_memory(
                "m1",
                "Overwrite without explicit approval.",
                node["node_id"],
                creator["creator_id"],
                expected_version=first["record"]["version"],
                approval_status="pending",
            )
            self.assertEqual("approval_required", second["status"])

    def test_security_rejects_env_and_token_paths(self):
        with BlueMesh(self.db_path) as mesh:
            self.assertFalse(mesh.sync.validate_path_for_sync("C:/project/.env")[0])
            self.assertFalse(mesh.sync.validate_path_for_sync("C:/project/tokens/api.txt")[0])
            self.assertTrue(mesh.sync.validate_path_for_sync("C:/project/docs/BlueMesh.md")[0])

    def test_ledger_is_append_only(self):
        result = run_first_working_prototype(self.db_path)
        with BlueMesh(self.db_path) as mesh:
            first = result["ledger_entries"][0]["change_id"]
            with self.assertRaises(Exception):
                mesh.database.execute(
                    "UPDATE blue_ledger SET change_type = 'tampered' WHERE change_id = ?",
                    (first,),
                )


if __name__ == "__main__":
    unittest.main()
'@

Write-ProjectFile "docs\BlueMesh.md" @'
# BlueMesh

BlueMesh is Project Blue's built-in collaboration system. It lets two or more trusted creator PCs run Blue locally while keeping Blue as one shared identity.

Core rule:

> Blue may have many devices, but only one identity.

## Architecture

- GitHub handles code history.
- BlueMesh handles shared identity, memory, settings, modules, project state, and sync events.
- Local Blue agents handle PC-specific actions.
- SQLite is the first local database.
- PostgreSQL or a cloud database can be added later by replacing the database adapter, not the sync rules.

## First prototype

The first prototype lives in `src/blue_mesh` and can:

- create one shared Blue identity;
- register two local nodes;
- record trusted devices and creators;
- write ledger entries;
- sync a test memory;
- detect a stale-version conflict;
- generate a conflict report.

Run it from `Project Blue App`:

```powershell
$env:PYTHONPATH="src"
python -m blue_mesh.prototype --db .blue/blue_mesh.db
```

## Security boundaries

- Tokens are never printed or intentionally stored.
- `.env` files are rejected from sync.
- Git internals are rejected from sync.
- Sensitive overwrites require approval.
- Constitution and identity changes require approval.
- Encryption is marked as a later milestone.
'@

Write-ProjectFile "docs\BlueprintIdentity.md" @'
# BlueIdentity

BlueIdentity stores the single shared Project Blue identity.

It records:

- `blue_id`
- display name
- creators and creator roles
- trusted device records
- Constitution data
- core identity metadata

The default shared ID is:

```text
blue-shared-identity
```

The identity rule is:

```text
Blue may have many devices, but only one identity.
```

Creators can register devices as trusted nodes, but a trusted node is still only a replica of the same Blue identity.
'@

Write-ProjectFile "docs\BlueprintLedger.md" @'
# BlueLedger

BlueLedger is the append-only audit trail for BlueMesh.

Every important change records:

- `change_id`
- timestamp
- `node_id`
- `creator_id`
- change type
- affected module
- before state
- after state
- approval status
- previous ledger hash
- current ledger hash

SQLite triggers block updates and deletes on the ledger table. The Python ledger verifier recomputes the hash chain to detect tampering.
'@

Write-ProjectFile "docs\BlueprintSync.md" @'
# BlueSync

BlueSync stores versioned shared state in SQLite.

Sync scopes:

- memory
- personality
- settings
- routines
- modules
- project status
- documentation
- local agent capabilities
- Constitution

BlueSync does not blindly overwrite records. Each shared record has a version number and timestamp. If one node writes from an old version after another node already updated the same record, BlueSync creates a conflict instead of overwriting.

Sensitive overwrites require approval before they are applied.
'@

Write-ProjectFile "docs\ConflictResolution.md" @'
# Conflict Resolution

BlueConflictResolver detects when two creators edit the same shared record from different versions.

When a conflict appears, BlueMesh creates a report with four options:

1. keep version A
2. keep version B
3. merge both
4. create manual review task

No shared memory or Constitution data is overwritten automatically during conflict handling.

The first prototype proves this by:

- creating a memory at version 1;
- letting Node A update it to version 2;
- letting Node B try to update from version 1;
- generating a conflict report instead of overwriting Node A.
'@

Write-ProjectFile "docs\MultiCreatorWorkflow.md" @'
# Multi-Creator Workflow

BlueMesh is for creators who want one Blue identity across multiple PCs.

## Normal workflow

1. Each creator runs Project Blue locally.
2. Each PC registers as a BlueNode with a unique `node_id`.
3. A Creator or Co-Creator marks the node as trusted.
4. Memory, settings, modules, project state, and docs sync through BlueMesh.
5. PC-specific abilities stay local and are recorded as node capabilities.

## Same Wi-Fi workflow

When both PCs are on the same LAN/Wi-Fi:

- BlueMesh can use LAN relay events.
- Nodes can sync faster without requiring GitHub for shared memory.
- GitHub still remains the code history source.

## Remote workflow

When PCs are not on the same network:

- GitHub handles code updates.
- A future internet relay can carry shared-state sync messages.
- Offline nodes queue sync events and re-sync later.

## Approval workflow

Sensitive changes require approval:

- Constitution edits
- identity edits
- trusted-device changes
- shared-memory overwrites
- rollback or destructive update actions

This protects Blue from becoming two diverging personalities.
'@

Write-ProjectFile "docs\BlueIdentity.md" @'
# BlueIdentity

BlueIdentity stores the single shared Project Blue identity.

It records:

- `blue_id`
- display name
- creators and creator roles
- trusted device records
- Constitution data
- core identity metadata

The default shared ID is:

```text
blue-shared-identity
```

The identity rule is:

```text
Blue may have many devices, but only one identity.
```

Creators can register devices as trusted nodes, but a trusted node is still only a replica of the same Blue identity.
'@

Write-ProjectFile "docs\BlueNode.md" @'
# BlueNode

BlueNode represents one PC running Project Blue.

Each node stores:

- unique `node_id`
- device name
- owner creator
- hardware metadata
- OS name
- local Project Blue paths
- online/offline status
- last seen timestamp

BlueNode is local-device identity, not Blue's core identity. Two PCs can have different node IDs while still carrying the same Blue ID.
'@

Write-ProjectFile "docs\BlueprintTrust.md" @'
# BlueTrust

BlueTrust defines creator roles and approval requirements.

Roles:

- Creator
- Co-Creator
- Steward
- Contributor
- Viewer

Sensitive changes require approval. This includes Constitution changes, identity edits, trusted-device updates, rollbacks, and overwrites to shared memory or other important shared state.

BlueTrust also blocks unsafe sync paths such as `.env`, Git internals, token paths, and secret paths.
'@

Write-ProjectFile "docs\BlueprintUpdateManager.md" @'
# BlueUpdateManager

BlueUpdateManager is the GitHub-aware update planner for BlueMesh.

Responsibilities:

- check the local Git revision;
- compare against a remote tracking branch;
- notify creators when an update exists;
- require approval before pulling;
- plan rollback to a previous stable revision.

The first version plans commands instead of executing destructive updates automatically.
'@

$PyprojectPath = Join-Path $ProjectRoot "pyproject.toml"
$Pyproject = [System.IO.File]::ReadAllText($PyprojectPath)
if ($Pyproject -notmatch "blue-mesh-demo") {
  $Pyproject = $Pyproject -replace 'blue = "project_blue\.cli:main"', 'blue = "project_blue.cli:main"' + "`r`n" + 'blue-mesh-demo = "blue_mesh.prototype:main"'
  [System.IO.File]::WriteAllText($PyprojectPath, $Pyproject, $Utf8NoBom)
}

Write-Host "BlueMesh files installed in $ProjectRoot"
