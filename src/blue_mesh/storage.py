from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


SCHEMA = """
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS blue_identity (
    blue_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    constitution_text TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creators (
    creator_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    public_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trusted_devices (
    device_id TEXT PRIMARY KEY,
    blue_id TEXT NOT NULL,
    node_id TEXT,
    creator_id TEXT NOT NULL,
    trust_label TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (blue_id) REFERENCES blue_identity(blue_id),
    FOREIGN KEY (creator_id) REFERENCES creators(creator_id)
);

CREATE TABLE IF NOT EXISTS blue_nodes (
    node_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    owner_creator_id TEXT NOT NULL,
    hardware_json TEXT NOT NULL,
    os_json TEXT NOT NULL,
    local_paths_json TEXT NOT NULL,
    online_status TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_creator_id) REFERENCES creators(creator_id)
);

CREATE TABLE IF NOT EXISTS ledger (
    change_id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    node_id TEXT,
    creator_id TEXT,
    change_type TEXT NOT NULL,
    affected_module TEXT NOT NULL,
    record_key TEXT NOT NULL DEFAULT '',
    before_state_json TEXT NOT NULL,
    after_state_json TEXT NOT NULL,
    approval_status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_time ON ledger(timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_module_key ON ledger(affected_module, record_key);

CREATE TRIGGER IF NOT EXISTS ledger_no_update
BEFORE UPDATE ON ledger
BEGIN
    SELECT RAISE(ABORT, 'BlueLedger is append-only; updates are not allowed');
END;

CREATE TRIGGER IF NOT EXISTS ledger_no_delete
BEFORE DELETE ON ledger
BEGIN
    SELECT RAISE(ABORT, 'BlueLedger is append-only; deletes are not allowed');
END;

CREATE TABLE IF NOT EXISTS shared_records (
    record_id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    record_key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    node_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    approval_status TEXT NOT NULL,
    UNIQUE(module, record_key)
);

CREATE TABLE IF NOT EXISTS node_record_cache (
    node_id TEXT NOT NULL,
    module TEXT NOT NULL,
    record_key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    version INTEGER NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (node_id, module, record_key)
);

CREATE TABLE IF NOT EXISTS conflicts (
    conflict_id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    record_key TEXT NOT NULL,
    base_version INTEGER NOT NULL,
    version_a INTEGER NOT NULL,
    version_b INTEGER NOT NULL,
    node_a_id TEXT NOT NULL,
    node_b_id TEXT NOT NULL,
    creator_a_id TEXT NOT NULL,
    creator_b_id TEXT NOT NULL,
    value_a_json TEXT NOT NULL,
    value_b_json TEXT NOT NULL,
    status TEXT NOT NULL,
    report_markdown TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status);

CREATE TABLE IF NOT EXISTS local_capabilities (
    capability_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def loads(value: str | None, default: Any = None) -> Any:
    if value is None or value == "":
        return default
    return json.loads(value)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


class BlueMeshStore:
    """SQLite storage boundary for BlueMesh.

    The rest of BlueMesh talks through this small adapter so a PostgreSQL
    adapter can be added later without rewriting identity, ledger, or sync code.
    """

    def __init__(self, database_path: str | Path):
        self.path = Path(database_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript(SCHEMA)
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> sqlite3.Cursor:
        cursor = self.connection.execute(sql, parameters)
        self.connection.commit()
        return cursor

    def query_one(self, sql: str, parameters: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        cursor = self.connection.execute(sql, parameters)
        return row_to_dict(cursor.fetchone())

    def query_all(self, sql: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        cursor = self.connection.execute(sql, parameters)
        return [dict(row) for row in cursor.fetchall()]

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        try:
            yield self.connection
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

