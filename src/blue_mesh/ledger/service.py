from __future__ import annotations

from typing import Any

from ..storage import BlueMeshStore, dumps, loads, new_id, utc_now


class BlueLedgerService:
    """Append-only change log for BlueMesh."""

    def __init__(self, store: BlueMeshStore):
        self.store = store

    def append_change(
        self,
        *,
        node_id: str | None,
        creator_id: str | None,
        change_type: str,
        affected_module: str,
        before_state: Any,
        after_state: Any,
        approval_status: str,
        record_key: str = "",
    ) -> str:
        change_id = new_id("change")
        self.store.execute(
            """
            INSERT INTO ledger (
                change_id, timestamp, node_id, creator_id, change_type,
                affected_module, record_key, before_state_json, after_state_json,
                approval_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                change_id,
                utc_now(),
                node_id,
                creator_id,
                change_type,
                affected_module,
                record_key,
                dumps(before_state),
                dumps(after_state),
                approval_status,
            ),
        )
        return change_id

    def recent(self, limit: int = 25) -> list[dict[str, Any]]:
        rows = self.store.query_all(
            "SELECT * FROM ledger ORDER BY timestamp DESC, change_id DESC LIMIT ?",
            (limit,),
        )
        for row in rows:
            row["before_state"] = loads(row.pop("before_state_json"), {})
            row["after_state"] = loads(row.pop("after_state_json"), {})
        return rows
