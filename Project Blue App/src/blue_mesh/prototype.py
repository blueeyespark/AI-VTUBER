from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Any

from .mesh import BlueMesh


def run_first_working_prototype(db_path: str | Path | None = None) -> dict[str, Any]:
    """Register two nodes, sync memory, detect a conflict, and return the report."""

    if db_path is None:
        db_path = Path(tempfile.mkdtemp(prefix="blue_mesh_")) / "blue_mesh.db"

    mesh = BlueMesh(db_path)
    try:
        identity = mesh.identity.create_shared_identity()
        creator_a = mesh.identity.add_creator("creator-adahn", "Adahn", "Creator")
        creator_b = mesh.identity.add_creator("creator-qwen", "Qwen", "Co-Creator")
        node_a = mesh.node.register_node(
            "Blue Node A",
            creator_a["creator_id"],
            hardware={"kind": "prototype"},
            os_name="local-prototype",
            local_paths={"project": "node-a/project-blue"},
            node_id="node-a",
        )
        node_b = mesh.node.register_node(
            "Blue Node B",
            creator_b["creator_id"],
            hardware={"kind": "prototype"},
            os_name="local-prototype",
            local_paths={"project": "node-b/project-blue"},
            node_id="node-b",
        )
        mesh.identity.trust_device(node_a["node_id"], creator_a["creator_id"])
        mesh.identity.trust_device(node_b["node_id"], creator_a["creator_id"])
        mesh.local_agent.register_capability(
            node_a["node_id"],
            "desktop_control",
            "Can help with approved low-risk actions on this PC.",
            "medium",
        )
        mesh.local_agent.register_capability(
            node_b["node_id"],
            "project_sync",
            "Can sync trusted Blue project state from the second creator PC.",
            "low",
        )

        seed = mesh.sync.sync_memory(
            "prototype.shared_memory",
            "Blue is one shared identity across trusted devices.",
            node_a["node_id"],
            creator_a["creator_id"],
        )
        base_version = seed["record"]["version"]
        edit_a = mesh.sync.sync_memory(
            "prototype.shared_memory",
            "Node A says Blue should remember that creators sync carefully.",
            node_a["node_id"],
            creator_a["creator_id"],
            expected_version=base_version,
            approval_status="approved",
        )
        edit_b = mesh.sync.sync_memory(
            "prototype.shared_memory",
            "Node B says Blue should remember that Wi-Fi sync is allowed for trusted PCs.",
            node_b["node_id"],
            creator_b["creator_id"],
            expected_version=base_version,
            approval_status="approved",
        )
        mesh.relay.log_lan_sync(node_a["node_id"], node_b["node_id"], {"record": "prototype.shared_memory"})
        ledger_ok, ledger_message = mesh.ledger.verify_chain()
        return {
            "database": str(db_path),
            "identity": identity,
            "nodes": [node_a, node_b],
            "seed_memory": seed,
            "node_a_update": edit_a,
            "node_b_update": edit_b,
            "conflict_detected": edit_b["status"] == "conflict",
            "conflict_report": edit_b.get("conflict", {}).get("report_text", ""),
            "ledger_verified": ledger_ok,
            "ledger_message": ledger_message,
            "ledger_entries": mesh.ledger.list_changes(),
        }
    finally:
        mesh.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the BlueMesh two-node prototype.")
    parser.add_argument("--db", type=Path, default=None, help="SQLite database path.")
    args = parser.parse_args()
    result = run_first_working_prototype(args.db)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()