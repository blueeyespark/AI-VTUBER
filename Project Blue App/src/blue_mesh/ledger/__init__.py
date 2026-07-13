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