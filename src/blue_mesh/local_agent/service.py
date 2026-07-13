from __future__ import annotations

from typing import Any

from ..storage import BlueMeshStore, dumps, loads, new_id, utc_now


class BlueLocalAgentRegistry:
    """Registers PC-specific actions without merging them into Blue's shared identity."""

    def __init__(self, store: BlueMeshStore):
        self.store = store

    def register_capability(
        self,
        *,
        node_id: str,
        name: str,
        description: str,
        risk_level: str,
        enabled: bool = False,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        capability_id = new_id("capability")
        now = utc_now()
        self.store.execute(
            """
            INSERT INTO local_capabilities
            (capability_id, node_id, name, description, risk_level, enabled, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (capability_id, node_id, name, description, risk_level, 1 if enabled else 0, dumps(metadata or {}), now, now),
        )
        return capability_id

    def list_capabilities(self, node_id: str) -> list[dict[str, Any]]:
        rows = self.store.query_all(
            "SELECT * FROM local_capabilities WHERE node_id = ? ORDER BY name",
            (node_id,),
        )
        for row in rows:
            row["enabled"] = bool(row["enabled"])
            row["metadata"] = loads(row.pop("metadata_json"), {})
        return rows
