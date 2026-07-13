from __future__ import annotations

from typing import Any

from ..ledger import BlueLedgerService
from ..storage import BlueMeshStore, dumps, loads, new_id, utc_now


DEFAULT_CONSTITUTION = """Blue may have many devices, but only one identity.

Blue must preserve creator trust, avoid secret exposure, log important changes,
and require explicit approval before overwriting shared memory or Constitution data.
"""


class BlueIdentityService:
    """Shared identity, creators, stewards, trusted devices, and Constitution."""

    def __init__(self, store: BlueMeshStore, ledger: BlueLedgerService):
        self.store = store
        self.ledger = ledger

    def create_shared_identity(
        self,
        *,
        blue_id: str | None = None,
        display_name: str = "Project Blue",
        constitution_text: str = DEFAULT_CONSTITUTION,
        metadata: dict[str, Any] | None = None,
        creator_id: str | None = None,
    ) -> str:
        existing = self.store.query_one("SELECT * FROM blue_identity LIMIT 1")
        if existing:
            return str(existing["blue_id"])
        now = utc_now()
        blue_id = blue_id or new_id("blue")
        identity_metadata = {
            "identity_rule": "one_identity_many_devices",
            "storage": "sqlite-local-first",
            **(metadata or {}),
        }
        self.store.execute(
            """
            INSERT INTO blue_identity
            (blue_id, display_name, constitution_text, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (blue_id, display_name, constitution_text, dumps(identity_metadata), now, now),
        )
        self.ledger.append_change(
            node_id=None,
            creator_id=creator_id,
            change_type="identity_created",
            affected_module="BlueIdentity",
            record_key=blue_id,
            before_state=None,
            after_state={"blue_id": blue_id, "display_name": display_name, "metadata": identity_metadata},
            approval_status="approved",
        )
        return blue_id

    def get_identity(self) -> dict[str, Any] | None:
        row = self.store.query_one("SELECT * FROM blue_identity LIMIT 1")
        if not row:
            return None
        row["metadata"] = loads(row.pop("metadata_json"), {})
        return row

    def add_creator(
        self,
        *,
        creator_id: str,
        display_name: str,
        role: str,
        public_note: str = "",
        node_id: str | None = None,
    ) -> str:
        now = utc_now()
        before = self.store.query_one("SELECT * FROM creators WHERE creator_id = ?", (creator_id,))
        self.store.execute(
            """
            INSERT INTO creators (creator_id, display_name, role, public_note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(creator_id) DO UPDATE SET
                display_name=excluded.display_name,
                role=excluded.role,
                public_note=excluded.public_note,
                updated_at=excluded.updated_at
            """,
            (creator_id, display_name, role, public_note, now, now),
        )
        self.ledger.append_change(
            node_id=node_id,
            creator_id=creator_id,
            change_type="creator_registered",
            affected_module="BlueIdentity",
            record_key=creator_id,
            before_state=before,
            after_state={"creator_id": creator_id, "display_name": display_name, "role": role},
            approval_status="approved",
        )
        return creator_id

    def add_trusted_device(
        self,
        *,
        blue_id: str,
        creator_id: str,
        node_id: str | None,
        trust_label: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        device_id = new_id("device")
        now = utc_now()
        self.store.execute(
            """
            INSERT INTO trusted_devices
            (device_id, blue_id, node_id, creator_id, trust_label, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (device_id, blue_id, node_id, creator_id, trust_label, dumps(metadata or {}), now, now),
        )
        self.ledger.append_change(
            node_id=node_id,
            creator_id=creator_id,
            change_type="trusted_device_added",
            affected_module="BlueIdentity",
            record_key=device_id,
            before_state=None,
            after_state={"device_id": device_id, "node_id": node_id, "trust_label": trust_label},
            approval_status="approved",
        )
        return device_id
