from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, TYPE_CHECKING

from ..storage import dumps, loads, new_id, utc_now

if TYPE_CHECKING:
    from ..mesh import BlueMesh


class BlueMeshTransportError(RuntimeError):
    pass


def generate_pairing_token() -> str:
    """Create a one-time LAN pairing secret. Do not commit or sync it."""
    return secrets.token_urlsafe(32)


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign_body(body: dict[str, Any], pairing_token: str) -> str:
    if not pairing_token:
        raise BlueMeshTransportError("Pairing token is required.")
    return hmac.new(pairing_token.encode("utf-8"), _canonical_json(body), hashlib.sha256).hexdigest()


def verify_bundle(bundle: dict[str, Any], pairing_token: str) -> dict[str, Any]:
    body = bundle.get("body")
    signature = bundle.get("signature")
    if not isinstance(body, dict) or not isinstance(signature, str):
        raise BlueMeshTransportError("Invalid BlueMesh bundle format.")
    expected = sign_body(body, pairing_token)
    if not hmac.compare_digest(expected, signature):
        raise BlueMeshTransportError("BlueMesh bundle signature did not match the pairing token.")
    return body


@dataclass(frozen=True)
class BlueMeshImportResult:
    status: str
    applied: tuple[str, ...]
    ignored: tuple[str, ...]
    conflicts: tuple[str, ...]
    synced_nodes: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "applied": list(self.applied),
            "ignored": list(self.ignored),
            "conflicts": list(self.conflicts),
            "synced_nodes": list(self.synced_nodes),
        }


class BlueMeshLanTransport:
    """Signed LAN/Wi-Fi bundle transport for trusted BlueMesh nodes.

    This moves approved shared records between separate BlueMesh SQLite
    databases while keeping BlueSync version checks, creator approval, and
    conflict reports in charge. It stores no tokens; the pairing token is
    provided only for the active session.
    """

    def __init__(self, mesh: "BlueMesh", pairing_token: str):
        if not pairing_token:
            raise BlueMeshTransportError("Pairing token is required.")
        self.mesh = mesh
        self.pairing_token = pairing_token

    def export_bundle(self, *, source_node_id: str | None = None) -> dict[str, Any]:
        identity = self.mesh.identity.get_identity()
        records = []
        for row in self.mesh.store.query_all("SELECT * FROM shared_records ORDER BY module, record_key"):
            records.append(
                {
                    "module": row["module"],
                    "record_key": row["record_key"],
                    "value": loads(row["value_json"], {}),
                    "version": int(row["version"]),
                    "updated_at": row["updated_at"],
                    "node_id": row["node_id"],
                    "creator_id": row["creator_id"],
                    "approval_status": row["approval_status"],
                }
            )
        body = {
            "bundle_version": 1,
            "bundle_id": new_id("lan_bundle"),
            "created_at": utc_now(),
            "source_node_id": source_node_id,
            "blue_identity": {
                "blue_id": identity.get("blue_id") if identity else None,
                "display_name": identity.get("display_name") if identity else None,
                "metadata": identity.get("metadata") if identity else {},
            },
            "records": records,
        }
        return {"body": body, "signature": sign_body(body, self.pairing_token)}

    def import_bundle(self, bundle: dict[str, Any], *, target_node_id: str, creator_id: str, approved: bool) -> BlueMeshImportResult:
        if not approved:
            return BlueMeshImportResult("requires_approval", (), (), (), ())
        body = verify_bundle(bundle, self.pairing_token)
        self._verify_identity(body.get("blue_identity") or {})
        applied: list[str] = []
        ignored: list[str] = []
        conflicts: list[str] = []
        synced_nodes: set[str] = set()
        for record in body.get("records", []):
            result = self._import_record(record, target_node_id=target_node_id, creator_id=creator_id)
            key = f"{record.get('module')}:{record.get('record_key')}"
            if result["status"] == "applied":
                applied.append(key)
                synced_nodes.update(result.get("synced_nodes", []))
            elif result["status"] == "conflict":
                conflicts.append(str(result["conflict_id"]))
            else:
                ignored.append(key)
        return BlueMeshImportResult("conflict" if conflicts else "ok", tuple(applied), tuple(ignored), tuple(conflicts), tuple(sorted(synced_nodes)))

    def _verify_identity(self, incoming_identity: dict[str, Any]) -> None:
        incoming_blue_id = incoming_identity.get("blue_id")
        local = self.mesh.identity.get_identity()
        if local and incoming_blue_id and local.get("blue_id") != incoming_blue_id:
            raise BlueMeshTransportError(f"Refusing bundle for Blue identity {incoming_blue_id}; local identity is {local.get('blue_id')}.")
        if local is None and incoming_blue_id:
            self.mesh.identity.create_shared_identity(
                blue_id=str(incoming_blue_id),
                display_name=str(incoming_identity.get("display_name") or "Project Blue"),
                metadata={"imported_from_lan_bundle": True},
            )

    def _import_record(self, record: dict[str, Any], *, target_node_id: str, creator_id: str) -> dict[str, Any]:
        module = str(record["module"])
        record_key = str(record["record_key"])
        value = record.get("value")
        incoming_version = int(record["version"])
        incoming_node_id = str(record.get("node_id") or target_node_id)
        incoming_creator_id = str(record.get("creator_id") or creator_id)
        current = self.mesh.sync.read_record(module, record_key)
        if current is not None:
            current_version = int(current["version"])
            same_value = dumps(current["value"]) == dumps(value)
            if incoming_version < current_version:
                return {"status": "ignored", "reason": "incoming_older"}
            if incoming_version == current_version and same_value:
                synced = self.mesh.sync.sync_record_to_trusted_nodes(source_node_id=target_node_id, module=module, record_key=record_key)
                return {"status": "ignored", "reason": "already_current", "synced_nodes": synced}
            if incoming_version == current_version and not same_value:
                conflict_id = self.mesh.conflicts.create_conflict(
                    module=module,
                    record_key=record_key,
                    base_version=max(0, incoming_version - 1),
                    version_a=current_version,
                    version_b=incoming_version,
                    node_a_id=str(current["node_id"]),
                    node_b_id=incoming_node_id,
                    creator_a_id=str(current["creator_id"]),
                    creator_b_id=incoming_creator_id,
                    value_a=current["value"],
                    value_b=value,
                )
                return {"status": "conflict", "conflict_id": conflict_id}
            before_state = current
            record_id = str(current["record_id"])
            self.mesh.store.execute(
                """
                UPDATE shared_records
                SET value_json = ?, version = ?, updated_at = ?, node_id = ?, creator_id = ?, approval_status = ?
                WHERE record_id = ?
                """,
                (dumps(value), incoming_version, str(record.get("updated_at") or utc_now()), incoming_node_id, incoming_creator_id, "approved", record_id),
            )
        else:
            before_state = None
            self.mesh.store.execute(
                """
                INSERT INTO shared_records
                (record_id, module, record_key, value_json, version, updated_at, node_id, creator_id, approval_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (new_id("record"), module, record_key, dumps(value), incoming_version, str(record.get("updated_at") or utc_now()), incoming_node_id, incoming_creator_id, "approved"),
            )
        after_state = self.mesh.sync.read_record(module, record_key)
        self.mesh.ledger.append_change(
            node_id=target_node_id,
            creator_id=creator_id,
            change_type="lan_record_imported",
            affected_module=module,
            record_key=record_key,
            before_state=before_state,
            after_state=after_state,
            approval_status="approved",
        )
        synced_nodes = self.mesh.sync.sync_record_to_trusted_nodes(source_node_id=target_node_id, module=module, record_key=record_key)
        return {"status": "applied", "synced_nodes": synced_nodes}


def post_bundle(peer_url: str, bundle: dict[str, Any], *, timeout: float = 10.0) -> dict[str, Any]:
    request = urllib.request.Request(
        peer_url.rstrip("/") + "/sync",
        data=_canonical_json(bundle),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise BlueMeshTransportError(f"Could not reach BlueMesh peer: {exc}") from exc
