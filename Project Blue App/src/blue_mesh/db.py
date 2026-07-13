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

            CREATE TABLE IF NOT EXISTS node_state_cache (
                node_id TEXT NOT NULL,
                scope TEXT NOT NULL,
                record_key TEXT NOT NULL,
                value_json TEXT NOT NULL,
                version INTEGER NOT NULL,
                synced_at TEXT NOT NULL,
                PRIMARY KEY(node_id, scope, record_key),
                FOREIGN KEY(node_id) REFERENCES blue_nodes(node_id)
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