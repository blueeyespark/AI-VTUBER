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