from __future__ import annotations

import os
import platform
from typing import Any

from ..ledger import BlueLedgerService
from ..storage import BlueMeshStore, dumps, loads, new_id, utc_now


class BlueNodeService:
    """Tracks each trusted PC running Blue."""

    def __init__(self, store: BlueMeshStore, ledger: BlueLedgerService):
        self.store = store
        self.ledger = ledger

    def register_node(
        self,
        *,
        owner_creator_id: str,
        node_id: str | None = None,
        device_name: str | None = None,
        hardware: dict[str, Any] | None = None,
        os_info: dict[str, Any] | None = None,
        local_paths: dict[str, str] | None = None,
        online_status: str = "online",
    ) -> str:
        node_id = node_id or new_id("node")
        device_name = device_name or platform.node() or node_id
        hardware = hardware or {
            "machine": platform.machine(),
            "processor": platform.processor(),
            "cpu_count": os.cpu_count(),
        }
        os_info = os_info or {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "platform": platform.platform(),
        }
        local_paths = local_paths or {}
        now = utc_now()
        before = self.store.query_one("SELECT * FROM blue_nodes WHERE node_id = ?", (node_id,))
        self.store.execute(
            """
            INSERT INTO blue_nodes (
                node_id, device_name, owner_creator_id, hardware_json, os_json,
                local_paths_json, online_status, last_seen_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id) DO UPDATE SET
                device_name=excluded.device_name,
                owner_creator_id=excluded.owner_creator_id,
                hardware_json=excluded.hardware_json,
                os_json=excluded.os_json,
                local_paths_json=excluded.local_paths_json,
                online_status=excluded.online_status,
                last_seen_at=excluded.last_seen_at,
                updated_at=excluded.updated_at
            """,
            (
                node_id,
                device_name,
                owner_creator_id,
                dumps(hardware),
                dumps(os_info),
                dumps(local_paths),
                online_status,
                now,
                now,
                now,
            ),
        )
        self.ledger.append_change(
            node_id=node_id,
            creator_id=owner_creator_id,
            change_type="node_registered",
            affected_module="BlueNode",
            record_key=node_id,
            before_state=before,
            after_state={
                "node_id": node_id,
                "device_name": device_name,
                "owner_creator_id": owner_creator_id,
                "online_status": online_status,
            },
            approval_status="approved",
        )
        return node_id

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        row = self.store.query_one("SELECT * FROM blue_nodes WHERE node_id = ?", (node_id,))
        if not row:
            return None
        row["hardware"] = loads(row.pop("hardware_json"), {})
        row["os"] = loads(row.pop("os_json"), {})
        row["local_paths"] = loads(row.pop("local_paths_json"), {})
        return row

    def list_nodes(self) -> list[dict[str, Any]]:
        rows = self.store.query_all("SELECT * FROM blue_nodes ORDER BY created_at, node_id")
        for row in rows:
            row["hardware"] = loads(row.pop("hardware_json"), {})
            row["os"] = loads(row.pop("os_json"), {})
            row["local_paths"] = loads(row.pop("local_paths_json"), {})
        return rows
