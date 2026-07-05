import tempfile
import unittest
from pathlib import Path

from blue_expansion import DOMAINS, ExpansionStore


class ExpansionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = ExpansionStore(Path(self.temp.name) / "expansion.db")

    def tearDown(self):
        self.store.connection.close()
        self.temp.cleanup()

    def test_all_missing_screenshot_domains_have_foundations(self):
        self.assertEqual(
            set(DOMAINS),
            {
                "automation", "network", "mobile", "community", "enterprise",
                "finance", "medical", "robotics", "explorer", "continuity",
                "world_model", "research",
            },
        )

    def test_finance_is_record_only(self):
        record = self.store.create(
            "finance", "budget", "Streaming budget", "Monthly plan", "user"
        )
        self.assertFalse(record["execution_enabled"])
        self.assertTrue(record["approval_required"])
        with self.assertRaisesRegex(ValueError, "not allowed"):
            self.store.create(
                "finance", "wire_transfer", "Send money", "Transfer now", "user"
            )

    def test_robotics_is_simulation_only(self):
        record = self.store.create(
            "robotics", "simulation_plan", "Arm simulation", "No hardware", "user"
        )
        self.assertIn("no hardware command", record["boundary"].lower())
        self.assertFalse(record["execution_enabled"])

    def test_automation_cannot_execute(self):
        record = self.store.create(
            "automation", "action_proposal", "Open OBS", "Proposed workflow", "user"
        )
        self.assertFalse(record["execution_enabled"])
        self.assertEqual(record["status"], "foundation_record")

    def test_community_content_stays_a_draft(self):
        record = self.store.create(
            "community", "content_draft", "Welcome", "Hello community", "user"
        )
        self.assertIn("never posted", record["boundary"])

    def test_medical_records_receive_boundary(self):
        record = self.store.create(
            "medical", "education_note", "First aid question", "Research needed", "user"
        )
        self.assertIn("not a diagnosis", record["content"])
        self.assertFalse(record["execution_enabled"])

    def test_network_and_mobile_do_not_create_connections(self):
        host = self.store.create(
            "network", "host_candidate", "Second PC", "Candidate only", "user"
        )
        mobile = self.store.create(
            "mobile", "invitation_plan", "Phone", "Plan only", "user"
        )
        self.assertIn("No connection", host["boundary"])
        self.assertIn("No public endpoint", mobile["boundary"])

    def test_world_model_claims_require_provenance_field(self):
        record = self.store.create(
            "world_model", "claim", "OBS version", "Unverified claim", "manual note"
        )
        self.assertEqual(record["source"], "manual note")
        self.assertIn("not treated as ground truth", record["boundary"])

    def test_secret_looking_values_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Secret-looking"):
            self.store.create(
                "network", "host_candidate", "Host", "access_token=secret", "user"
            )

    def test_unknown_kinds_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "not allowed"):
            self.store.create(
                "explorer", "launch_real_vehicle", "No", "No", "user"
            )

    def test_lists_are_bounded_and_filterable(self):
        self.store.create("enterprise", "team", "Blue team", "Local", "user")
        self.store.create("finance", "budget", "Budget", "Local", "user")
        self.assertEqual(len(self.store.list()), 2)
        self.assertEqual(len(self.store.list("enterprise")), 1)

    def test_audit_chain_verifies_and_detects_tampering(self):
        self.store.create("continuity", "seed_manifest", "Seed", "Plan", "user")
        self.assertTrue(self.store.verify_audit()["valid"])
        self.store.connection.execute(
            "UPDATE audit SET details_json = '{}' WHERE id = 1"
        )
        self.store.connection.commit()
        self.assertFalse(self.store.verify_audit()["valid"])

    def test_status_lists_every_domain_with_execution_off(self):
        status = self.store.status()
        self.assertEqual(len(status["domains"]), len(DOMAINS))
        self.assertTrue(all(not row["execution_enabled"] for row in status["domains"]))
        self.assertTrue(status["audit_valid"])


if __name__ == "__main__":
    unittest.main()
