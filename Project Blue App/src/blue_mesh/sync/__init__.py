from __future__ import annotations

from typing import Any

from ..conflict import BlueConflictResolver
from ..db import BlueMeshDatabase, json_dumps, json_loads, new_id, utc_now
from ..ledger import BlueLedger
from ..trust import BlueTrust


SYNC_SCOPES = {
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


class BlueSync:
    """Versioned shared-state sync that refuses blind overwrites."""

    def __init__(
        self,
        database: BlueMeshDatabase,
        ledger: BlueLedger,
        conflict_resolver: BlueConflictResolver,
        trust: BlueTrust,
    ):
        self.database = database
        self.ledger = ledger
        self.conflict_resolver = conflict_resolver
        self.trust = trust

    def get_record(self, scope: str, record_key: str) -> dict[str, Any] | None:
        row = self.database.fetch_one(
            "SELECT * FROM shared_state WHERE scope = ? AND record_key = ?",
            (scope, record_key),
        )
        if row is None:
            return None
        return {
            "state_id": row["state_id"],
            "scope": row["scope"],
            "record_key": row["record_key"],
            "value": json_loads(row["value_json"], {}),
            "version": row["version"],
            "updated_at": row["updated_at"],
            "updated_by_node_id": row["updated_by_node_id"],
            "updated_by_creator_id": row["updated_by_creator_id"],
            "approval_status": row["approval_status"],
            "previous_state": json_loads(row["previous_state_json"], None),
        }

    def write_record(
        self,
        scope: str,
        record_key: str,
        value: dict[str, Any],
        node_id: str,
        creator_id: str,
        expected_version: int | None = None,
        approval_status: str = "approved",
    ) -> dict[str, Any]:
        if scope not in SYNC_SCOPES:
            raise ValueError(f"Unsupported sync scope: {scope}")
        current = self.get_record(scope, record_key)
        is_overwrite = current is not None

        if (
            current
            and expected_version is not None
            and current["version"] != expected_version
        ):
            conflict = self.conflict_resolver.create_conflict(
                scope=scope,
                record_key=record_key,
                base_version=expected_version,
                current_version=current["version"],
                version_a=current,
                version_b={
                    "scope": scope,
                    "record_key": record_key,
                    "value": value,
                    "expected_version": expected_version,
                    "node_id": node_id,
                    "creator_id": creator_id,
                },
                node_a_id=current["updated_by_node_id"],
                node_b_id=node_id,
                creator_a_id=current["updated_by_creator_id"],
                creator_b_id=creator_id,
            )
            return {"status": "conflict", "conflict": conflict}

        if self.trust.requires_approval("write", scope, is_overwrite) and approval_status != "approved":
            self.ledger.append_change(
                node_id=node_id,
                creator_id=creator_id,
                change_type="approval_required",
                affected_module=scope,
                before_state=current,
                after_state=value,
                approval_status="pending",
            )
            return {
                "status": "approval_required",
                "reason": "Sensitive or overwrite sync requires approval.",
                "record": current,
            }

        now = utc_now()
        state_id = current["state_id"] if current else new_id("state")
        version = (current["version"] + 1) if current else 1
        previous_state_json = json_dumps(current) if current else None
        self.database.execute(
            """
            INSERT INTO shared_state
            (state_id, scope, record_key, value_json, version, updated_at,
             updated_by_node_id, updated_by_creator_id, approval_status, previous_state_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope, record_key) DO UPDATE SET
                value_json = excluded.value_json,
                version = excluded.version,
                updated_at = excluded.updated_at,
                updated_by_node_id = excluded.updated_by_node_id,
                updated_by_creator_id = excluded.updated_by_creator_id,
                approval_status = excluded.approval_status,
                previous_state_json = excluded.previous_state_json
            """,
            (
                state_id,
                scope,
                record_key,
                json_dumps(value),
                version,
                now,
                node_id,
                creator_id,
                approval_status,
                previous_state_json,
            ),
        )
        updated = self.get_record(scope, record_key)
        self.ledger.append_change(
            node_id=node_id,
            creator_id=creator_id,
            change_type="sync_write",
            affected_module=f"{scope}:{record_key}",
            before_state=current,
            after_state=updated,
            approval_status=approval_status,
        )
        synced_nodes = self.sync_record_to_trusted_nodes(source_node_id=node_id, scope=scope, record_key=record_key)
        return {"status": "synced", "record": updated, "synced_nodes": synced_nodes}

    def trusted_node_ids(self, fallback_node_id: str | None = None) -> list[str]:
        rows = self.database.fetch_all(
            """
            SELECT DISTINCT td.node_id
            FROM trusted_devices td
            JOIN blue_nodes bn ON bn.node_id = td.node_id
            WHERE td.trust_status = 'trusted'
            ORDER BY td.created_at, td.node_id
            """
        )
        node_ids = [str(row["node_id"]) for row in rows]
        if not node_ids:
            node_ids = [str(row["node_id"]) for row in self.database.fetch_all("SELECT node_id FROM blue_nodes ORDER BY created_at, node_id")]
        if fallback_node_id and fallback_node_id not in node_ids:
            node_ids.append(fallback_node_id)
        return node_ids

    def read_node_cache(self, node_id: str, scope: str, record_key: str) -> dict[str, Any] | None:
        row = self.database.fetch_one(
            """
            SELECT * FROM node_state_cache
            WHERE node_id = ? AND scope = ? AND record_key = ?
            """,
            (node_id, scope, record_key),
        )
        if row is None:
            return None
        return {
            "node_id": row["node_id"],
            "scope": row["scope"],
            "record_key": row["record_key"],
            "value": json_loads(row["value_json"], {}),
            "version": row["version"],
            "synced_at": row["synced_at"],
        }

    def sync_record_to_node(self, node_id: str, scope: str, record_key: str) -> dict[str, Any]:
        record = self.get_record(scope, record_key)
        if record is None:
            raise KeyError(f"Unknown shared record: {scope}:{record_key}")
        self.database.execute(
            """
            INSERT INTO node_state_cache (node_id, scope, record_key, value_json, version, synced_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(node_id, scope, record_key) DO UPDATE SET
                value_json = excluded.value_json,
                version = excluded.version,
                synced_at = excluded.synced_at
            """,
            (node_id, scope, record_key, json_dumps(record["value"]), record["version"], utc_now()),
        )
        return record

    def sync_record_to_trusted_nodes(self, source_node_id: str, scope: str, record_key: str) -> list[str]:
        synced_nodes: list[str] = []
        for target_node_id in self.trusted_node_ids(fallback_node_id=source_node_id):
            self.sync_record_to_node(target_node_id, scope, record_key)
            self.record_sync_event(
                source_node_id,
                target_node_id,
                "trusted-node-cache",
                "synced",
                {"scope": scope, "record_key": record_key},
            )
            synced_nodes.append(target_node_id)
        return synced_nodes
    def sync_memory(
        self,
        memory_id: str,
        text: str,
        node_id: str,
        creator_id: str,
        expected_version: int | None = None,
        approval_status: str = "approved",
        tags: list[str] | None = None,
    ) -> dict[str, Any]:
        return self.write_record(
            "memory",
            memory_id,
            {"text": text, "tags": tags or []},
            node_id=node_id,
            creator_id=creator_id,
            expected_version=expected_version,
            approval_status=approval_status,
        )

    def record_sync_event(
        self,
        source_node_id: str,
        target_node_id: str | None,
        channel: str,
        status: str,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        event_id = new_id("sync_event")
        self.database.execute(
            """
            INSERT INTO sync_events
            (event_id, timestamp, source_node_id, target_node_id, channel, status, details_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, utc_now(), source_node_id, target_node_id, channel, status, json_dumps(details or {})),
        )
        row = self.database.fetch_one("SELECT * FROM sync_events WHERE event_id = ?", (event_id,))
        return dict(row) if row else {}

    def validate_path_for_sync(self, path: str) -> tuple[bool, str]:
        return self.trust.validate_sync_path(path)