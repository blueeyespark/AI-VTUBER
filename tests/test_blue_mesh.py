import sqlite3
import tempfile
import unittest
from pathlib import Path

from blue_mesh import BlueMesh, run_prototype


class BlueMeshRootPrototypeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "blue_mesh.db"
        self.report_dir = Path(self.temp.name) / "reports"

    def tearDown(self):
        self.temp.cleanup()

    def test_first_working_prototype(self):
        result = run_prototype(self.db_path, self.report_dir)
        self.assertEqual("blue_shared_identity", result["blue_id"])
        self.assertEqual(["node_creator_pc", "node_qwen_pc"], result["nodes"])
        self.assertEqual("ok", result["node_a_update_status"])
        self.assertEqual("conflict", result["node_b_update_status"])
        self.assertTrue(Path(result["conflict_report"]).exists())
        self.assertIn("only one identity", result["final_rule"])
        self.assertGreaterEqual(result["ledger_entries"], 10)

    def test_one_identity_two_nodes_and_trusted_devices(self):
        with BlueMesh(self.db_path) as mesh:
            creator = mesh.identity.add_creator(creator_id="creator_a", display_name="A", role="Creator")
            co_creator = mesh.identity.add_creator(creator_id="creator_b", display_name="B", role="Co-Creator")
            blue_id = mesh.identity.create_shared_identity(blue_id="blue_one", creator_id=creator)
            node_a = mesh.nodes.register_node(node_id="node_a", owner_creator_id=creator, device_name="Creator-PC")
            node_b = mesh.nodes.register_node(node_id="node_b", owner_creator_id=co_creator, device_name="Qwen-PC")
            mesh.identity.add_trusted_device(blue_id=blue_id, creator_id=creator, node_id=node_a, trust_label="primary")
            mesh.identity.add_trusted_device(blue_id=blue_id, creator_id=co_creator, node_id=node_b, trust_label="co-creator")
            self.assertEqual("blue_one", mesh.identity.get_identity()["blue_id"])
            self.assertEqual(2, len(mesh.nodes.list_nodes()))

    def test_sync_memory_conflict_and_approval_rules(self):
        with BlueMesh(self.db_path) as mesh:
            creator = mesh.identity.add_creator(creator_id="creator_a", display_name="A", role="Creator")
            co_creator = mesh.identity.add_creator(creator_id="creator_b", display_name="B", role="Co-Creator")
            mesh.identity.create_shared_identity(blue_id="blue_one", creator_id=creator)
            node_a = mesh.nodes.register_node(node_id="node_a", owner_creator_id=creator)
            node_b = mesh.nodes.register_node(node_id="node_b", owner_creator_id=co_creator)
            first = mesh.sync.write_record(module="memory", record_key="m1", value={"text": "first"}, node_id=node_a, creator_id=creator)
            self.assertEqual("ok", first["status"])
            blocked = mesh.sync.write_record(module="memory", record_key="m1", value={"text": "blocked overwrite"}, node_id=node_a, creator_id=creator, expected_version=1)
            self.assertEqual("requires_approval", blocked["status"])
            approved = mesh.sync.write_record(module="memory", record_key="m1", value={"text": "approved overwrite"}, node_id=node_a, creator_id=creator, expected_version=1, approval_status="approved")
            self.assertEqual("ok", approved["status"])
            conflict = mesh.sync.write_record(module="memory", record_key="m1", value={"text": "stale node edit"}, node_id=node_b, creator_id=co_creator, expected_version=1, approval_status="approved")
            self.assertEqual("conflict", conflict["status"])
            self.assertTrue(mesh.conflicts.get_conflict(conflict["conflict_id"]))

    def test_approved_update_mirrors_to_all_trusted_nodes(self):
        with BlueMesh(self.db_path) as mesh:
            creator = mesh.identity.add_creator(creator_id="creator_a", display_name="A", role="Creator")
            co_creator = mesh.identity.add_creator(creator_id="creator_b", display_name="B", role="Co-Creator")
            blue_id = mesh.identity.create_shared_identity(blue_id="blue_one", creator_id=creator)
            node_a = mesh.nodes.register_node(node_id="node_a", owner_creator_id=creator)
            node_b = mesh.nodes.register_node(node_id="node_b", owner_creator_id=co_creator)
            mesh.identity.add_trusted_device(blue_id=blue_id, creator_id=creator, node_id=node_a, trust_label="primary")
            mesh.identity.add_trusted_device(blue_id=blue_id, creator_id=co_creator, node_id=node_b, trust_label="co-creator")

            first = mesh.sync.write_record(
                module="memory",
                record_key="shared.lesson",
                value={"text": "Node A created this memory."},
                node_id=node_a,
                creator_id=creator,
            )
            self.assertEqual("ok", first["status"])
            self.assertEqual({"node_a", "node_b"}, set(first["synced_nodes"]))
            node_b_cache = mesh.sync.read_node_cache(node_id=node_b, module="memory", record_key="shared.lesson")
            self.assertEqual(1, int(node_b_cache["version"]))
            self.assertEqual("Node A created this memory.", node_b_cache["value"]["text"])

            second = mesh.sync.write_record(
                module="memory",
                record_key="shared.lesson",
                value={"text": "Node B approved and updated this memory."},
                node_id=node_b,
                creator_id=co_creator,
                expected_version=1,
                approval_status="approved",
            )
            self.assertEqual("ok", second["status"])
            self.assertEqual({"node_a", "node_b"}, set(second["synced_nodes"]))
            node_a_cache = mesh.sync.read_node_cache(node_id=node_a, module="memory", record_key="shared.lesson")
            self.assertEqual(2, int(node_a_cache["version"]))
            self.assertEqual("Node B approved and updated this memory.", node_a_cache["value"]["text"])
    def test_security_rejects_secret_paths(self):
        with BlueMesh(self.db_path) as mesh:
            self.assertFalse(mesh.sync.validate_path_for_sync("C:/project/.env")[0])
            self.assertFalse(mesh.sync.validate_path_for_sync("C:/project/tokens/api.txt")[0])
            self.assertFalse(mesh.sync.validate_path_for_sync("C:/project/cert/private.key")[0])
            self.assertTrue(mesh.sync.validate_path_for_sync("C:/project/docs/BlueMesh.md")[0])

    def test_ledger_is_append_only(self):
        result = run_prototype(self.db_path, self.report_dir)
        with BlueMesh(self.db_path) as mesh:
            first_change = mesh.ledger.recent(1)[0]["change_id"]
            with self.assertRaises(sqlite3.DatabaseError):
                mesh.store.execute("UPDATE ledger SET change_type = 'tampered' WHERE change_id = ?", (first_change,))
            with self.assertRaises(sqlite3.DatabaseError):
                mesh.store.execute("DELETE FROM ledger WHERE change_id = ?", (first_change,))
        self.assertGreaterEqual(result["ledger_entries"], 10)

    def test_shared_upgrade_requires_two_creator_approvals(self):
        with BlueMesh(self.db_path) as mesh:
            plan = mesh.update_manager.plan_pull(approved=True, approvals={"creator_a": True}, required_approvals=2)
            self.assertEqual("requires_approval", plan["status"])
            self.assertIn("two creators", plan["reason"].lower())

            ready = mesh.update_manager.plan_pull(
                approved=True,
                approvals={"creator_a": True, "creator_b": True},
                required_approvals=2,
            )
            self.assertEqual("ready", ready["status"])
            self.assertEqual(["git", "fetch", "origin"], ready["commands"][0])

    def test_update_manager_guards_tokens_and_rollback(self):
        with BlueMesh(self.db_path) as mesh:
            with self.assertRaises(ValueError):
                mesh.update_manager.remote_head(repo_url="https://token@example.com/owner/repo.git")
            plan = mesh.update_manager.plan_pull(approved=False)
            self.assertEqual("requires_approval", plan["status"])
            rollback = mesh.update_manager.plan_rollback(stable_revision="b65ff5a", approved=True)
            self.assertEqual("ready", rollback["status"])


if __name__ == "__main__":
    unittest.main()
