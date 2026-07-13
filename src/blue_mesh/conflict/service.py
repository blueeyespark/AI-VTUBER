from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..ledger import BlueLedgerService
from ..storage import BlueMeshStore, dumps, loads, new_id, utc_now


class BlueConflictResolver:
    """Creates conflict reports and records creator resolution decisions."""

    def __init__(self, store: BlueMeshStore, ledger: BlueLedgerService):
        self.store = store
        self.ledger = ledger

    def create_conflict(
        self,
        *,
        module: str,
        record_key: str,
        base_version: int,
        version_a: int,
        version_b: int,
        node_a_id: str,
        node_b_id: str,
        creator_a_id: str,
        creator_b_id: str,
        value_a: Any,
        value_b: Any,
    ) -> str:
        conflict_id = new_id("conflict")
        created_at = utc_now()
        report = self.render_report(
            conflict_id=conflict_id,
            module=module,
            record_key=record_key,
            base_version=base_version,
            version_a=version_a,
            version_b=version_b,
            node_a_id=node_a_id,
            node_b_id=node_b_id,
            creator_a_id=creator_a_id,
            creator_b_id=creator_b_id,
            value_a=value_a,
            value_b=value_b,
        )
        self.store.execute(
            """
            INSERT INTO conflicts (
                conflict_id, module, record_key, base_version, version_a, version_b,
                node_a_id, node_b_id, creator_a_id, creator_b_id,
                value_a_json, value_b_json, status, report_markdown, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conflict_id,
                module,
                record_key,
                base_version,
                version_a,
                version_b,
                node_a_id,
                node_b_id,
                creator_a_id,
                creator_b_id,
                dumps(value_a),
                dumps(value_b),
                "open",
                report,
                created_at,
            ),
        )
        self.ledger.append_change(
            node_id=node_b_id,
            creator_id=creator_b_id,
            change_type="conflict_detected",
            affected_module=module,
            record_key=record_key,
            before_state={"version_a": version_a, "value_a": value_a},
            after_state={"version_b": version_b, "value_b": value_b, "conflict_id": conflict_id},
            approval_status="manual_review_required",
        )
        return conflict_id

    def get_conflict(self, conflict_id: str) -> dict[str, Any] | None:
        row = self.store.query_one("SELECT * FROM conflicts WHERE conflict_id = ?", (conflict_id,))
        if not row:
            return None
        row["value_a"] = loads(row.pop("value_a_json"), {})
        row["value_b"] = loads(row.pop("value_b_json"), {})
        row["resolution"] = loads(row.pop("resolution_json"), None)
        return row

    def list_open(self) -> list[dict[str, Any]]:
        return self.store.query_all("SELECT * FROM conflicts WHERE status = 'open' ORDER BY created_at")

    def render_report(self, **data: Any) -> str:
        value_a = json.dumps(data["value_a"], ensure_ascii=False, indent=2, sort_keys=True)
        value_b = json.dumps(data["value_b"], ensure_ascii=False, indent=2, sort_keys=True)
        return f"""# BlueMesh Conflict Report

- Conflict ID: `{data['conflict_id']}`
- Module: `{data['module']}`
- Record key: `{data['record_key']}`
- Base version: `{data['base_version']}`
- Version A: `{data['version_a']}` from `{data['node_a_id']}` / `{data['creator_a_id']}`
- Version B: `{data['version_b']}` from `{data['node_b_id']}` / `{data['creator_b_id']}`

## Choices

1. Keep version A
2. Keep version B
3. Merge both
4. Create manual review task

## Version A

```json
{value_a}
```

## Version B

```json
{value_b}
```
"""

    def write_report(self, conflict_id: str, report_directory: str | Path) -> Path:
        conflict = self.get_conflict(conflict_id)
        if not conflict:
            raise KeyError(f"Unknown conflict: {conflict_id}")
        directory = Path(report_directory)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{conflict_id}.md"
        path.write_text(conflict["report_markdown"], encoding="utf-8")
        return path

    def resolve(self, *, conflict_id: str, decision: str, resolved_by: str, merged_value: Any | None = None) -> None:
        if decision not in {"keep_a", "keep_b", "merge_both", "manual_review"}:
            raise ValueError("decision must be keep_a, keep_b, merge_both, or manual_review")
        resolution = {
            "decision": decision,
            "resolved_by": resolved_by,
            "merged_value": merged_value,
        }
        self.store.execute(
            """
            UPDATE conflicts
            SET status = ?, resolved_at = ?, resolution_json = ?
            WHERE conflict_id = ?
            """,
            ("resolved" if decision != "manual_review" else "manual_review", utc_now(), dumps(resolution), conflict_id),
        )
