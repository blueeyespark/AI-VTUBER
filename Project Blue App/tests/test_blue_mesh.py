import tempfile
import unittest
from pathlib import Path

from blue_mesh import BlueMesh, run_first_working_prototype


class BlueMeshPrototypeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "blue_mesh.db"

    def tearDown(self):
        self.temp.cleanup()

    def test_first_working_prototype(self):
        result = run_first_working_prototype(self.db_path)
        self.assertEqual("blue-shared-identity", result["identity"]["blue_id"])
        self.assertEqual(2, len(result["nodes"]))
        self.assertTrue(result["conflict_detected"])
        self.assertIn("keep version A", result["conflict_report"])
        self.assertIn("merge both", result["conflict_report"])
        self.assertTrue(result["ledger_verified"], result["ledger_message"])
        self.assertGreaterEqual(len(result["ledger_entries"]), 3)

    def test_sensitive_overwrite_requires_approval(self):
        with BlueMesh(self.db_path) as mesh:
            mesh.identity.create_shared_identity()
            creator = mesh.identity.add_creator("creator", "Creator", "Creator")
            node = mesh.node.register_node("Node", creator["creator_id"], node_id="node")
            first = mesh.sync.sync_memory("m1", "Initial.", node["node_id"], creator["creator_id"])
            self.assertEqual("synced", first["status"])
            second = mesh.sync.sync_memory(
                "m1",
                "Overwrite without explicit approval.",
                node["node_id"],
                creator["creator_id"],
                expected_version=first["record"]["version"],
                approval_status="pending",
            )
            self.assertEqual("approval_required", second["status"])

    def test_approved_update_mirrors_to_all_trusted_nodes(self):
        with BlueMesh(self.db_path) as mesh:
            mesh.identity.create_shared_identity()
            creator_a = mesh.identity.add_creator("creator-a", "A", "Creator")
            creator_b = mesh.identity.add_creator("creator-b", "B", "Co-Creator")
            node_a = mesh.node.register_node("Node A", creator_a["creator_id"], node_id="node-a")
            node_b = mesh.node.register_node("Node B", creator_b["creator_id"], node_id="node-b")
            mesh.identity.trust_device(node_a["node_id"], creator_a["creator_id"])
            mesh.identity.trust_device(node_b["node_id"], creator_a["creator_id"])

            first = mesh.sync.sync_memory(
                "shared.lesson",
                "Node A created this memory.",
                node_a["node_id"],
                creator_a["creator_id"],
            )
            self.assertEqual("synced", first["status"])
            self.assertEqual({"node-a", "node-b"}, set(first["synced_nodes"]))
            node_b_cache = mesh.sync.read_node_cache("node-b", "memory", "shared.lesson")
            self.assertEqual(1, node_b_cache["version"])
            self.assertEqual("Node A created this memory.", node_b_cache["value"]["text"])

            second = mesh.sync.sync_memory(
                "shared.lesson",
                "Node B approved and updated this memory.",
                node_b["node_id"],
                creator_b["creator_id"],
                expected_version=1,
                approval_status="approved",
            )
            self.assertEqual("synced", second["status"])
            self.assertEqual({"node-a", "node-b"}, set(second["synced_nodes"]))
            node_a_cache = mesh.sync.read_node_cache("node-a", "memory", "shared.lesson")
            self.assertEqual(2, node_a_cache["version"])
            self.assertEqual("Node B approved and updated this memory.", node_a_cache["value"]["text"])
    def test_security_rejects_env_and_token_paths(self):
        with BlueMesh(self.db_path) as mesh:
            self.assertFalse(mesh.sync.validate_path_for_sync("C:/project/.env")[0])
            self.assertFalse(mesh.sync.validate_path_for_sync("C:/project/tokens/api.txt")[0])
            self.assertTrue(mesh.sync.validate_path_for_sync("C:/project/docs/BlueMesh.md")[0])

    def test_ledger_is_append_only(self):
        result = run_first_working_prototype(self.db_path)
        with BlueMesh(self.db_path) as mesh:
            first = result["ledger_entries"][0]["change_id"]
            with self.assertRaises(Exception):
                mesh.database.execute(
                    "UPDATE blue_ledger SET change_type = 'tampered' WHERE change_id = ?",
                    (first,),
                )


if __name__ == "__main__":
    unittest.main()