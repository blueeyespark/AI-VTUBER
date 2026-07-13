from __future__ import annotations

from typing import Any

from ..db import BlueMeshDatabase, json_dumps, json_loads, new_id, utc_now
from ..ledger import BlueLedger


CONFLICT_OPTIONS = ["keep_version_a", "keep_version_b", "merge_both", "manual_review_task"]


class BlueConflictResolver:
    """Detects and records cases where trusted nodes edited the same record."""

    def __init__(self, database: BlueMeshDatabase, ledger: BlueLedger):
        self.database = database
        self.ledger = ledger

    def create_conflict(
        self,
        scope: str,
        record_key: str,
        base_version: int | None,
        current_version: int,
        version_a: dict[str, Any],
        version_b: dict[str, Any],
        node_a_id: str,
        node_b_id: str,
        creator_a_id: str,
        creator_b_id: str,
    ) -> dict[str, Any]:
        conflict_id = new_id("conflict")
        created_at = utc_now()
        report = {
            "conflict_id": conflict_id,
            "scope": scope,
            "record_key": record_key,
            "base_version": base_version,
            "current_version": current_version,
            "options": CONFLICT_OPTIONS,
            "summary": "Two trusted Blue nodes edited the same shared record from different versions.",
        }
        report_text = self.render_report(report, version_a, version_b)
        self.database.execute(
            """
            INSERT INTO conflicts
            (conflict_id, created_at, scope, record_key, base_version, current_version,
             version_a_json, version_b_json, node_a_id, node_b_id, creator_a_id, creator_b_id,
             report_json, report_text, status, resolution_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL)
            """,
            (
                conflict_id,
                created_at,
                scope,
                record_key,
                base_version,
                current_version,
                json_dumps(version_a),
                json_dumps(version_b),
                node_a_id,
                node_b_id,
                creator_a_id,
                creator_b_id,
                json_dumps(report),
                report_text,
            ),
        )
        self.ledger.append_change(
            node_id=node_b_id,
            creator_id=creator_b_id,
            change_type="conflict_detected",
            affected_module=f"{scope}:{record_key}",
            before_state=version_a,
            after_state={"proposed": version_b, "conflict_id": conflict_id},
            approval_status="manual_review_required",
        )
        return self.get_conflict(conflict_id) or {}

    def get_conflict(self, conflict_id: str) -> dict[str, Any] | None:
        row = self.database.fetch_one("SELECT * FROM conflicts WHERE conflict_id = ?", (conflict_id,))
        if row is None:
            return None
        return {
            "conflict_id": row["conflict_id"],
            "created_at": row["created_at"],
            "scope": row["scope"],
            "record_key": row["record_key"],
            "base_version": row["base_version"],
            "current_version": row["current_version"],
            "version_a": json_loads(row["version_a_json"], {}),
            "version_b": json_loads(row["version_b_json"], {}),
            "node_a_id": row["node_a_id"],
            "node_b_id": row["node_b_id"],
            "creator_a_id": row["creator_a_id"],
            "creator_b_id": row["creator_b_id"],
            "report": json_loads(row["report_json"], {}),
            "report_text": row["report_text"],
            "status": row["status"],
            "resolution": json_loads(row["resolution_json"], None),
        }

    def list_conflicts(self, status: str | None = None) -> list[dict[str, Any]]:
        if status:
            rows = self.database.fetch_all("SELECT conflict_id FROM conflicts WHERE status = ? ORDER BY created_at", (status,))
        else:
            rows = self.database.fetch_all("SELECT conflict_id FROM conflicts ORDER BY created_at")
        return [self.get_conflict(row["conflict_id"]) or {} for row in rows]

    def resolve_conflict(self, conflict_id: str, choice: str, creator_id: str, notes: str = "") -> dict[str, Any]:
        if choice not in CONFLICT_OPTIONS:
            raise ValueError(f"Unsupported conflict choice: {choice}")
        conflict = self.get_conflict(conflict_id)
        if not conflict:
            raise KeyError(conflict_id)
        resolution = {"choice": choice, "creator_id": creator_id, "notes": notes, "resolved_at": utc_now()}
        self.database.execute(
            "UPDATE conflicts SET status = 'resolved', resolution_json = ? WHERE conflict_id = ?",
            (json_dumps(resolution), conflict_id),
        )
        return self.get_conflict(conflict_id) or {}

    def render_report(self, report: dict[str, Any], version_a: dict[str, Any], version_b: dict[str, Any]) -> str:
        lines = [
            f"# BlueMesh Conflict Report: {report['conflict_id']}",
            "",
            f"- Record: `{report['scope']}:{report['record_key']}`",
            f"- Base version: `{report['base_version']}`",
            f"- Current version: `{report['current_version']}`",
            "",
            "## Creator choices",
            "",
            "- keep version A",
            "- keep version B",
            "- merge both",
            "- create manual review task",
            "",
            "## Version A",
            "",
            json_dumps(version_a),
            "",
            "## Version B",
            "",
            json_dumps(version_b),
        ]
        return "\n".join(lines)