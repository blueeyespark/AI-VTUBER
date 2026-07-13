import tempfile
import unittest
from pathlib import Path

from blue_mesh import BlueMesh
from blue_mesh.relay import BlueMeshLanTransport, BlueMeshTransportError, generate_pairing_token, verify_bundle


class BlueMeshLanTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.a_db = Path(self.temp.name) / "node_a" / "blue_mesh.db"
        self.b_db = Path(self.temp.name) / "node_b" / "blue_mesh.db"
        self.token = generate_pairing_token()

    def tearDown(self):
        self.temp.cleanup()

    def _setup_mesh(self, db_path: Path, *, node_id: str, creator_id: str) -> None:
        with BlueMesh(db_path) as mesh:
            mesh.identity.add_creator(creator_id=creator_id, display_name=creator_id, role="Creator")
            blue_id = mesh.identity.create_shared_identity(blue_id="blue_shared_identity", creator_id=creator_id)
            mesh.nodes.register_node(node_id=node_id, owner_creator_id=creator_id, device_name=node_id)
            mesh.identity.add_trusted_device(blue_id=blue_id, creator_id=creator_id, node_id=node_id, trust_label=node_id)

    def test_signed_bundle_moves_memory_between_two_databases(self):
        self._setup_mesh(self.a_db, node_id="node_a", creator_id="creator_a")
        self._setup_mesh(self.b_db, node_id="node_b", creator_id="creator_b")

        with BlueMesh(self.a_db) as mesh_a:
            first = mesh_a.sync.write_record(
                module="memory",
                record_key="shared.note",
                value={"text": "Created on node A and sent over LAN."},
                node_id="node_a",
                creator_id="creator_a",
            )
            self.assertEqual("ok", first["status"])
            bundle = BlueMeshLanTransport(mesh_a, self.token).export_bundle(source_node_id="node_a")

        with BlueMesh(self.b_db) as mesh_b:
            result = BlueMeshLanTransport(mesh_b, self.token).import_bundle(
                bundle,
                target_node_id="node_b",
                creator_id="creator_b",
                approved=True,
            )
            self.assertEqual("ok", result.status)
            self.assertIn("memory:shared.note", result.applied)
            record = mesh_b.sync.read_record("memory", "shared.note")
            self.assertEqual("Created on node A and sent over LAN.", record["value"]["text"])
            cache = mesh_b.sync.read_node_cache(node_id="node_b", module="memory", record_key="shared.note")
            self.assertEqual(1, int(cache["version"]))

    def test_signed_bundle_rejects_wrong_pairing_token(self):
        self._setup_mesh(self.a_db, node_id="node_a", creator_id="creator_a")
        with BlueMesh(self.a_db) as mesh_a:
            mesh_a.sync.write_record(
                module="memory",
                record_key="shared.note",
                value={"text": "token protected"},
                node_id="node_a",
                creator_id="creator_a",
            )
            bundle = BlueMeshLanTransport(mesh_a, self.token).export_bundle(source_node_id="node_a")
        with self.assertRaises(BlueMeshTransportError):
            verify_bundle(bundle, "wrong-token")

    def test_same_version_different_values_creates_conflict(self):
        self._setup_mesh(self.a_db, node_id="node_a", creator_id="creator_a")
        self._setup_mesh(self.b_db, node_id="node_b", creator_id="creator_b")

        with BlueMesh(self.a_db) as mesh_a:
            mesh_a.sync.write_record(
                module="memory",
                record_key="shared.note",
                value={"text": "A version"},
                node_id="node_a",
                creator_id="creator_a",
            )
            bundle = BlueMeshLanTransport(mesh_a, self.token).export_bundle(source_node_id="node_a")

        with BlueMesh(self.b_db) as mesh_b:
            mesh_b.sync.write_record(
                module="memory",
                record_key="shared.note",
                value={"text": "B version"},
                node_id="node_b",
                creator_id="creator_b",
            )
            result = BlueMeshLanTransport(mesh_b, self.token).import_bundle(
                bundle,
                target_node_id="node_b",
                creator_id="creator_b",
                approved=True,
            )
            self.assertEqual("conflict", result.status)
            self.assertEqual(1, len(result.conflicts))
            conflict = mesh_b.conflicts.get_conflict(result.conflicts[0])
            self.assertIn("Keep version A", conflict["report_markdown"])

    def test_import_requires_approval(self):
        self._setup_mesh(self.a_db, node_id="node_a", creator_id="creator_a")
        self._setup_mesh(self.b_db, node_id="node_b", creator_id="creator_b")
        with BlueMesh(self.a_db) as mesh_a:
            bundle = BlueMeshLanTransport(mesh_a, self.token).export_bundle(source_node_id="node_a")
        with BlueMesh(self.b_db) as mesh_b:
            result = BlueMeshLanTransport(mesh_b, self.token).import_bundle(
                bundle,
                target_node_id="node_b",
                creator_id="creator_b",
                approved=False,
            )
            self.assertEqual("requires_approval", result.status)


if __name__ == "__main__":
    unittest.main()
