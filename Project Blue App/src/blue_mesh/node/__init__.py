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