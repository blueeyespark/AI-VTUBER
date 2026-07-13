from __future__ import annotations

import argparse
import json
from pathlib import Path
from uuid import uuid4

from .mesh import BlueMesh


def run_prototype(database_path: str | Path, report_directory: str | Path) -> dict[str, object]:
    mesh = BlueMesh(database_path)
    try:
        primary_creator = mesh.identity.add_creator(
            creator_id="creator_primary",
            display_name="Primary Creator",
            role="Creator",
            public_note="Local owner of this Project Blue install.",
        )
        qwen_creator = mesh.identity.add_creator(
            creator_id="creator_qwen",
            display_name="Qwen Co-Creator",
            role="Co-Creator",
            public_note="Trusted co-creator node for BlueMesh prototype.",
        )
        blue_id = mesh.identity.create_shared_identity(
            blue_id="blue_shared_identity",
            display_name="Blue",
            creator_id=primary_creator,
            metadata={"prototype": "BlueMesh v0.1.0"},
        )
        node_a = mesh.nodes.register_node(
            node_id="node_creator_pc",
            owner_creator_id=primary_creator,
            device_name="Creator-PC",
            local_paths={"project": str(Path.cwd())},
            online_status="online",
        )
        node_b = mesh.nodes.register_node(
            node_id="node_qwen_pc",
            owner_creator_id=qwen_creator,
            device_name="Qwen-PC",
            local_paths={"project": "LAN-or-GitHub-peer"},
            online_status="offline-demo",
        )
        mesh.identity.add_trusted_device(
            blue_id=blue_id,
            creator_id=primary_creator,
            node_id=node_a,
            trust_label="primary_creator_pc",
            metadata={"sync_modes": ["local", "lan", "github"]},
        )
        mesh.identity.add_trusted_device(
            blue_id=blue_id,
            creator_id=qwen_creator,
            node_id=node_b,
            trust_label="qwen_cocreator_pc",
            metadata={"sync_modes": ["lan", "internet_relay"]},
        )
        mesh.local_agent.register_capability(
            node_id=node_a,
            name="desktop_presence",
            description="Runs Blue's local desktop avatar and control panel.",
            risk_level="low",
            enabled=True,
        )

        memory_key = f"prototype.test_memory.{uuid4().hex[:8]}"
        first_write = mesh.sync.write_record(
            module="memory",
            record_key=memory_key,
            value={"text": "Blue is one identity replicated across trusted devices."},
            node_id=node_a,
            creator_id=primary_creator,
        )
        base_version = int(first_write["record"]["version"])
        mesh.sync.sync_record_to_node(node_id=node_b, module="memory", record_key=memory_key)

        node_a_update = mesh.sync.write_record(
            module="memory",
            record_key=memory_key,
            value={"text": "Node A says BlueMesh should protect the shared Blue identity."},
            node_id=node_a,
            creator_id=primary_creator,
            expected_version=base_version,
            approval_status="approved",
        )
        node_b_conflict = mesh.sync.write_record(
            module="memory",
            record_key=memory_key,
            value={"text": "Node B says BlueMesh should merge co-creator memories carefully."},
            node_id=node_b,
            creator_id=qwen_creator,
            expected_version=base_version,
            approval_status="approved",
        )
        conflict_id = str(node_b_conflict["conflict_id"])
        report_path = mesh.conflicts.write_report(conflict_id, report_directory)

        return {
            "blue_id": blue_id,
            "nodes": [node_a, node_b],
            "memory_key": memory_key,
            "base_version": base_version,
            "node_a_update_status": node_a_update["status"],
            "node_b_update_status": node_b_conflict["status"],
            "conflict_id": conflict_id,
            "conflict_report": str(report_path),
            "ledger_entries": len(mesh.ledger.recent(1000)),
            "final_rule": "Blue may have many devices, but only one identity.",
        }
    finally:
        mesh.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the BlueMesh first working prototype.")
    parser.add_argument("--db", default="Project Blue App/.blue/bluemesh_prototype.db")
    parser.add_argument("--reports", default="docs/conflict_reports")
    args = parser.parse_args(argv)
    summary = run_prototype(args.db, args.reports)
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



