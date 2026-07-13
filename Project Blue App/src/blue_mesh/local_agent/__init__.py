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