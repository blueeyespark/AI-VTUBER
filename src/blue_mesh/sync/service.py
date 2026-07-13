from __future__ import annotations

from pathlib import Path
from typing import Any

from ..conflict import BlueConflictResolver
from ..ledger import BlueLedgerService
from ..storage import BlueMeshStore, dumps, loads, new_id, utc_now
from ..trust import BlueTrustService


SYNC_MODULES = {
    "memory",
    "personality",
    "settings",
    "routines",
    "modules",
    "project_status",
    "documentation",
    "local_agent_capabilities",
    "constitution",
}

APPROVAL_REQUIRED_ON_OVERWRITE = {
    "memory",
    "constitution",
    "personality",
    "settings",
}

BLOCKED_SYNC_FILE_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".npmrc",
}

BLOCKED_SYNC_PARTS = {
    "token",
    "tokens",
    "secret",
    "secrets",
    "credential",
    "credentials",
    "apikey",
    "api_key",
}

BLOCKED_SYNC_SUFFIXES = {
    ".pem",
    ".key",
    ".pfx",
    ".p12",
}


class BlueSyncService:
    """Versioned sync for Blue's shared state.

    BlueSync intentionally does not blindly overwrite data. Shared records carry
    version numbers and timestamps. A stale write creates a conflict report, and
    overwrites of memory, Constitution, personality, or settings require an
    explicit approved status from a trusted creator/steward workflow.
    """

    def __init__(
        self,
        store: BlueMeshStore,
        ledger: BlueLedgerService,
        conflicts: BlueConflictResolver,
        trust: BlueTrustService,
    ):
        self.store = store
        self.ledger = ledger
        self.conflicts = conflicts
        self.trust = trust

    def validate_path_for_sync(self, path: str | Path) -> tuple[bool, str]:
        candidate = Path(path)
        lowered_name = candidate.name.lower()
        lowered_parts = {part.lower() for part in candidate.parts}
        if lowered_name in BLOCKED_SYNC_FILE_NAMES:
            return False, "BlueMesh never syncs .env or local secret configuration files."
        if candidate.suffix.lower() in BLOCKED_SYNC_SUFFIXES:
            return False, "BlueMesh never syncs private-key or certificate secret files."
        if lowered_parts & BLOCKED_SYNC_PARTS:
            return False, "BlueMesh never syncs token, secret, credential, or API-key paths."
        return True, "Path is allowed for BlueMesh sync planning."

    def read_record(self, module: str, record_key: str) -> dict[str, Any] | None:
        row = self.store.query_one(
            "SELECT * FROM shared_records WHERE module = ? AND record_key = ?",
            (module, record_key),
        )
        if not row:
            return None
        row["value"] = loads(row.pop("value_json"), {})
        return row

    def _requires_approval(self, *, module: str, change_type: str, current: dict[str, Any] | None) -> bool:
        if self.trust.requires_approval(affected_module=module, change_type=change_type):
            return True
        if current is not None and module in APPROVAL_REQUIRED_ON_OVERWRITE:
            return True
        return False

    def _approval_status(
        self,
        *,
        module: str,
        change_type: str,
        current: dict[str, Any] | None,
        requested_status: str | None,
    ) -> str:
        requested = (requested_status or "pending").strip().lower()
        if current is None and requested in {"", "pending", "requires_approval"}:
            return "approved"
        if self._requires_approval(module=module, change_type=change_type, current=current):
            return "approved" if requested == "approved" else "requires_approval"
        if requested in {"", "pending", "requires_approval"}:
            return "approved"
        return requested

    def write_record(
        self,
        *,
        module: str,
        record_key: str,
        value: Any,
        node_id: str,
        creator_id: str,
        expected_version: int | None = None,
        approval_status: str | None = None,
    ) -> dict[str, Any]:
        if module not in SYNC_MODULES:
            raise ValueError(f"Unsupported BlueMesh sync module: {module}")

        current = self.read_record(module, record_key)
        change_type = "record_created" if current is None else "record_updated"

        if current is not None and expected_version is not None and expected_version != int(current["version"]):
            conflict_id = self.conflicts.create_conflict(
                module=module,
                record_key=record_key,
                base_version=expected_version,
                version_a=int(current["version"]),
                version_b=expected_version + 1,
                node_a_id=str(current["node_id"]),
                node_b_id=node_id,
                creator_a_id=str(current["creator_id"]),
                creator_b_id=creator_id,
                value_a=current["value"],
                value_b=value,
            )
            return {"status": "conflict", "conflict_id": conflict_id, "record": current}

        resolved_approval = self._approval_status(
            module=module,
            change_type=change_type,
            current=current,
            requested_status=approval_status,
        )
        if resolved_approval != "approved":
            self.ledger.append_change(
                node_id=node_id,
                creator_id=creator_id,
                change_type="change_waiting_for_approval",
                affected_module=module,
                record_key=record_key,
                before_state=current,
                after_state={"value": value},
                approval_status=resolved_approval,
            )
            return {
                "status": "requires_approval",
                "reason": "Overwriting shared memory, identity, Constitution, personality, or settings needs creator approval.",
                "record": current,
            }

        now = utc_now()
        if current is None:
            record_id = new_id("record")
            version = 1
            before_state = None
            self.store.execute(
                """
                INSERT INTO shared_records
                (record_id, module, record_key, value_json, version, updated_at, node_id, creator_id, approval_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (record_id, module, record_key, dumps(value), version, now, node_id, creator_id, resolved_approval),
            )
        else:
            record_id = str(current["record_id"])
            version = int(current["version"]) + 1
            before_state = current
            self.store.execute(
                """
                UPDATE shared_records
                SET value_json = ?, version = ?, updated_at = ?, node_id = ?, creator_id = ?, approval_status = ?
                WHERE record_id = ?
                """,
                (dumps(value), version, now, node_id, creator_id, resolved_approval, record_id),
            )

        after_state = self.read_record(module, record_key)
        self.ledger.append_change(
            node_id=node_id,
            creator_id=creator_id,
            change_type=change_type,
            affected_module=module,
            record_key=record_key,
            before_state=before_state,
            after_state=after_state,
            approval_status=resolved_approval,
        )
        synced_nodes = self.sync_record_to_trusted_nodes(
            source_node_id=node_id,
            module=module,
            record_key=record_key,
        )
        return {"status": "ok", "record": after_state, "synced_nodes": synced_nodes}

    def trusted_node_ids(self, *, fallback_node_id: str | None = None) -> list[str]:
        """Return trusted BlueNode ids that should receive shared-state updates.

        BlueMesh treats trusted devices as replicas of one Blue identity. If a
        test/demo has nodes but no trusted-device rows yet, fall back to the
        registered nodes so local two-node smoke tests still prove sync logic.
        """
        rows = self.store.query_all(
            """
            SELECT DISTINCT td.node_id, td.created_at
            FROM trusted_devices td
            JOIN blue_nodes bn ON bn.node_id = td.node_id
            WHERE td.node_id IS NOT NULL
            ORDER BY td.created_at, td.node_id
            """
        )
        node_ids = [str(row["node_id"]) for row in rows if row.get("node_id")]
        if not node_ids:
            node_ids = [str(row["node_id"]) for row in self.store.query_all("SELECT node_id FROM blue_nodes ORDER BY created_at, node_id")]
        if fallback_node_id and fallback_node_id not in node_ids:
            node_ids.append(fallback_node_id)
        return node_ids

    def sync_record_to_trusted_nodes(self, *, source_node_id: str, module: str, record_key: str) -> list[str]:
        """Mirror an approved shared record into every trusted node cache."""
        synced_nodes: list[str] = []
        for target_node_id in self.trusted_node_ids(fallback_node_id=source_node_id):
            self.sync_record_to_node(node_id=target_node_id, module=module, record_key=record_key)
            synced_nodes.append(target_node_id)
        return synced_nodes
    def sync_record_to_node(self, *, node_id: str, module: str, record_key: str) -> dict[str, Any]:
        record = self.read_record(module, record_key)
        if record is None:
            raise KeyError(f"Unknown shared record: {module}:{record_key}")
        existing = self.read_node_cache(node_id=node_id, module=module, record_key=record_key)
        synced_at = utc_now()
        self.store.execute(
            """
            INSERT INTO node_record_cache (node_id, module, record_key, value_json, version, synced_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id, module, record_key) DO UPDATE SET
                value_json=excluded.value_json,
                version=excluded.version,
                synced_at=excluded.synced_at
            """,
            (node_id, module, record_key, dumps(record["value"]), int(record["version"]), synced_at),
        )
        self.ledger.append_change(
            node_id=node_id,
            creator_id=str(record["creator_id"]),
            change_type="record_synced_to_node",
            affected_module=module,
            record_key=record_key,
            before_state=existing,
            after_state={"node_id": node_id, "version": record["version"], "synced_at": synced_at},
            approval_status="approved",
        )
        return record

    def sync_all_to_node(self, *, node_id: str, modules: set[str] | None = None) -> list[dict[str, Any]]:
        selected_modules = modules or SYNC_MODULES
        records = self.store.query_all(
            "SELECT module, record_key FROM shared_records ORDER BY module, record_key"
        )
        synced: list[dict[str, Any]] = []
        for record in records:
            if record["module"] in selected_modules:
                synced.append(
                    self.sync_record_to_node(
                        node_id=node_id,
                        module=str(record["module"]),
                        record_key=str(record["record_key"]),
                    )
                )
        return synced

    def read_node_cache(self, *, node_id: str, module: str, record_key: str) -> dict[str, Any] | None:
        row = self.store.query_one(
            """
            SELECT * FROM node_record_cache
            WHERE node_id = ? AND module = ? AND record_key = ?
            """,
            (node_id, module, record_key),
        )
        if not row:
            return None
        row["value"] = loads(row.pop("value_json"), {})
        return row
