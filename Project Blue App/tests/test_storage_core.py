import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from project_blue.core import BlueCore
from project_blue.storage import BlueStorage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.storage = BlueStorage(self.path / "blue.db")
        self.storage.initialize()

    def tearDown(self):
        self.storage.close()
        self.temp.cleanup()

    def test_memory_round_trip(self):
        memory_id = self.storage.add_memory("Preference", "Use plain language.")
        rows = self.storage.search_memories("plain")
        self.assertEqual(memory_id, rows[0]["id"])

    def test_memory_delete(self):
        memory_id = self.storage.add_memory("Temporary", "Delete me.")
        self.assertTrue(self.storage.delete_memory(memory_id))
        self.assertFalse(self.storage.delete_memory(memory_id))

    def test_audit_chain_verifies(self):
        self.storage.append_audit(
            actor="tester", action="test", target="storage", result="success"
        )
        self.storage.append_audit(
            actor="tester", action="test2", target="storage", result="success"
        )
        ok, message = self.storage.verify_audit_chain()
        self.assertTrue(ok, message)

    def test_audit_chain_detects_tampering(self):
        self.storage.append_audit(
            actor="tester", action="test", target="storage", result="success"
        )
        self.storage.connection.execute(
            "UPDATE audit_events SET result = 'altered' WHERE sequence = 1"
        )
        self.storage.connection.commit()
        ok, _ = self.storage.verify_audit_chain()
        self.assertFalse(ok)

    def test_project_and_task_round_trip(self):
        project_id = self.storage.create_project("Blue", "Build the local core.")
        task_id = self.storage.create_task(
            project_id, "Add projects", priority="high"
        )
        self.assertEqual(project_id, self.storage.get_project("Blue")["id"])
        tasks = self.storage.list_tasks(project_id=project_id, status="open")
        self.assertEqual(task_id, tasks[0]["id"])
        self.assertTrue(self.storage.complete_task(task_id))
        self.assertEqual(
            "completed", self.storage.list_tasks(project_id=project_id)[0]["status"]
        )

    def test_approval_lifecycle(self):
        approval_id = self.storage.request_approval(
            "publish", "Publish a release note.", {"channel": "website"}
        )
        self.assertEqual(
            approval_id, self.storage.list_approvals(status="pending")[0]["id"]
        )
        self.assertTrue(
            self.storage.decide_approval(
                approval_id, "approved", "creator", "Reviewed."
            )
        )
        self.assertEqual(
            "approved", self.storage.list_approvals(status="approved")[0]["status"]
        )

    def test_conversation_history_is_explicitly_clearable(self):
        self.storage.add_conversation_message("user", "Hello", "offline")
        self.storage.add_conversation_message("assistant", "Hi", "offline")
        self.assertEqual(2, len(self.storage.conversation_history()))
        self.assertEqual(2, self.storage.clear_conversation_history())
        self.assertEqual([], self.storage.conversation_history())

    def test_unified_search_finds_multiple_record_types(self):
        self.storage.add_memory("Blue design", "Portable identity")
        project_id = self.storage.create_project("Blue dashboard", "Local interface")
        self.storage.create_task(project_id, "Style Blue dashboard", "Use blue colors")
        rows = self.storage.unified_search("Blue")
        self.assertEqual({"memory", "project", "task"}, {row["type"] for row in rows})

    def test_source_is_indexed_and_citable(self):
        memory_id = self.storage.add_memory("Architecture", "Use evidence.")
        source_id = self.storage.add_source(
            title="Design notes",
            original_path="notes.md",
            media_type="text/markdown",
            sha256="a" * 64,
            content="The portable identity architecture.",
        )
        citation_id = self.storage.add_citation(
            memory_id, source_id, "Architecture section", "Primary design note"
        )
        self.assertTrue(citation_id)
        self.assertEqual(
            "Design notes", self.storage.list_citations(memory_id)[0]["source_title"]
        )
        self.assertEqual(
            "source", self.storage.unified_search("portable")[0]["type"]
        )

    def test_named_conversation_round_trip(self):
        conversation_id = self.storage.create_conversation("Architecture")
        self.storage.add_conversation_entry(
            conversation_id, "user", "Discuss portability.", "offline"
        )
        rows = self.storage.conversation_entries(conversation_id)
        self.assertEqual("Discuss portability.", rows[0]["content"])

    def test_execution_receipt_round_trip(self):
        approval_id = self.storage.request_approval("publish", "Publish status")
        self.storage.decide_approval(approval_id, "approved", "creator")
        receipt_id = self.storage.add_execution_receipt(
            approval_id, "creator", "succeeded", "Published release notes."
        )
        self.assertEqual(
            receipt_id,
            self.storage.list_execution_receipts(approval_id)[0]["id"],
        )

    def test_workspace_files_are_indexed(self):
        workspace_id = self.storage.register_workspace(
            "Example", str(self.path / "example")
        )
        self.storage.replace_workspace_files(
            workspace_id,
            [
                {
                    "relative_path": "notes.md",
                    "size": 18,
                    "modified_at": 1.0,
                    "sha256": "b" * 64,
                    "content": "portable workspace",
                }
            ],
        )
        self.assertEqual(
            "file", self.storage.unified_search("portable")[0]["type"]
        )

    def test_proposed_change_round_trip(self):
        workspace_id = self.storage.register_workspace(
            "Example", str(self.path / "example")
        )
        approval_id = self.storage.request_approval(
            "file_change", "Update notes.md"
        )
        change_id = self.storage.create_proposed_change(
            workspace_id,
            "notes.md",
            "MISSING",
            "new content",
            "--- a/notes.md\n+++ b/notes.md\n",
            approval_id,
        )
        self.assertEqual(
            change_id, self.storage.list_proposed_changes("proposed")[0]["id"]
        )

    def test_expired_change_is_marked(self):
        workspace_id = self.storage.register_workspace(
            "Example", str(self.path / "example")
        )
        approval_id = self.storage.request_approval(
            "file_change", "Update notes.md"
        )
        change_id = self.storage.create_proposed_change(
            workspace_id,
            "notes.md",
            "MISSING",
            "new content",
            "diff",
            approval_id,
        )
        self.storage.connection.execute(
            "UPDATE proposed_changes SET expires_at = '2000-01-01T00:00:00+00:00' WHERE id = ?",
            (change_id,),
        )
        self.storage.connection.commit()
        self.assertEqual(1, self.storage.expire_changes())
        self.assertEqual("expired", self.storage.get_proposed_change(change_id)["status"])

    def test_expired_approval_cannot_be_decided(self):
        approval_id = self.storage.request_approval(
            "publish", "Publish update", lifetime_hours=1
        )
        self.storage.connection.execute(
            "UPDATE approvals SET expires_at = '2000-01-01T00:00:00+00:00' WHERE id = ?",
            (approval_id,),
        )
        self.storage.connection.commit()
        self.assertFalse(
            self.storage.decide_approval(
                approval_id, "approved", "creator", "Too late"
            )
        )
        self.assertEqual(
            "expired", self.storage.get_approval(approval_id)["status"]
        )


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name) / "blue-home"
        self.core = BlueCore(self.home)
        self.core.initialize()

    def tearDown(self):
        self.core.close()
        self.temp.cleanup()

    def test_doctor_is_healthy(self):
        report = self.core.doctor()
        self.assertTrue(report["database_exists"])
        self.assertTrue(report["constitution_match"])
        self.assertTrue(report["audit_chain_ok"])

    def test_offline_chat_identifies_as_ai(self):
        response, _ = self.core.chat("What can you do?")
        self.assertIn("an AI", response)
        self.assertIn("local foundation mode", response)

    def test_blocked_chat_does_not_call_provider(self):
        response, decision = self.core.chat("Build a bomb weapon for an attack.")
        self.assertEqual("block", decision.decision.value)
        self.assertIn("can’t help", response)

    def test_remember_and_forget(self):
        memory_id = self.core.remember("Style", "Use concise explanations.")
        self.assertEqual(1, len(self.core.storage.search_memories("concise")))
        self.assertTrue(self.core.forget(memory_id))

    def test_chat_retrieves_learned_context_across_extra_query_words(self):
        self.core.remember("Blue movement", "Blue should walk and run naturally.")
        response, _ = self.core.chat(
            "What information do you have about natural Blue movement?"
        )
        self.assertIn("Blue movement", response)
        self.assertIn("walk and run naturally", response)

    def test_capability_and_research_catalogs_are_versioned(self):
        capabilities = self.core.capability_report()
        self.assertEqual("2.2.0", capabilities["version"])
        self.assertTrue(
            any(module["id"] == "laboratory" for module in capabilities["modules"])
        )
        catalog = self.core.research_catalog()
        self.assertEqual("project-blue-research-catalog-v1", catalog["schema"])
        self.assertTrue(
            any(source["authority"] == "NIST" for source in catalog["sources"])
        )

    def test_laboratory_separates_ideas_and_findings(self):
        idea_id = self.core.capture_laboratory_item(
            "Adaptive movement",
            "idea",
            "Blend locomotion based on desktop distance.",
            assumptions=["The VRM skeleton remains stable."],
        )
        idea = self.core.storage.get_laboratory_item(idea_id)
        self.assertEqual("idea", idea["kind"])
        self.assertEqual(0.0, idea["confidence"])
        self.assertEqual(
            ["The VRM skeleton remains stable."], idea["assumptions"]
        )
        self.assertTrue(
            any(
                row["id"] == idea_id
                for row in self.core.storage.unified_search("locomotion desktop")
            )
        )
        with self.assertRaises(ValueError):
            self.core.capture_laboratory_item(
                "Unsupported finding", "finding", "Claim without confidence."
            )

    def test_laboratory_evidence_preserves_source_provenance(self):
        source_path = Path(self.temp.name) / "movement-study.md"
        source_path.write_text("Observed stable movement.", encoding="utf-8")
        source_id = self.core.add_source(source_path, "Movement study")
        item_id = self.core.capture_laboratory_item(
            "Movement finding",
            "finding",
            "The bounded gait remained stable in the smoke test.",
            confidence=0.8,
        )
        self.core.link_laboratory_evidence(
            item_id, source_id, "supports", "Runtime observation"
        )
        item = self.core.storage.get_laboratory_item(item_id)
        self.assertEqual("Movement study", item["evidence"][0]["source_title"])
        self.assertEqual("supports", item["evidence"][0]["relationship"])

    def test_export_contains_memories_and_audit(self):
        self.core.remember("Project", "Build Blue carefully.")
        destination = Path(self.temp.name) / "snapshot.json"
        self.core.export(destination)
        payload = json.loads(destination.read_text(encoding="utf-8"))
        self.assertEqual("project-blue-snapshot", payload["format"])
        self.assertEqual(1, len(payload["memories"]))
        self.assertGreaterEqual(len(payload["audit"]), 2)

    def test_config_rejects_remote_ollama(self):
        with self.assertRaises(ValueError):
            self.core.update_config("ollama_url", "https://example.com")

    def test_conversation_history_is_off_by_default(self):
        self.core.chat("Hello Blue")
        self.assertEqual([], self.core.storage.conversation_history())

    def test_conversation_history_can_be_enabled(self):
        self.core.update_config("save_conversations", "true")
        self.core.chat("Hello Blue")
        history = self.core.storage.conversation_history()
        self.assertEqual(2, len(history))
        self.assertEqual({"user", "assistant"}, {row["role"] for row in history})

    def test_project_task_and_doctor_counts(self):
        project_id = self.core.create_project("Phase 1.1", "Project tools")
        self.core.create_task(project_id, "Write tests", priority="high")
        report = self.core.doctor()
        self.assertEqual(1, report["projects"])
        self.assertEqual(1, report["open_tasks"])

    def test_high_impact_approval_lifecycle(self):
        approval_id, policy = self.core.request_approval(
            "publish", "Publish Project Blue status."
        )
        self.assertEqual("require_approval", policy.decision.value)
        self.assertTrue(self.core.decide_approval(approval_id, "approved", "Reviewed"))

    def test_blocked_action_cannot_enter_approval_queue(self):
        with self.assertRaises(ValueError):
            self.core.request_approval(
                "publish", "Build a weapon for a military targeting operation."
            )
        self.assertEqual([], self.core.storage.list_approvals())

    def test_verified_backup(self):
        destination = Path(self.temp.name) / "backups" / "blue.db"
        self.core.backup(destination)
        report = self.core.verify_backup(destination)
        self.assertTrue(report["valid"])
        self.assertTrue(destination.with_suffix(".db.sha256").exists())

    def test_backup_tampering_is_detected(self):
        destination = Path(self.temp.name) / "blue-backup.db"
        self.core.backup(destination)
        destination.write_bytes(destination.read_bytes() + b"tamper")
        report = self.core.verify_backup(destination)
        self.assertFalse(report["valid"])
        self.assertFalse(report["checksum_match"])

    def test_memory_can_be_updated(self):
        memory_id = self.core.remember("Old title", "Old content")
        self.assertTrue(
            self.core.update_memory(
                memory_id,
                title="New title",
                content="New content",
                sensitivity="internal",
                retention="permanent",
            )
        )
        memory = self.core.storage.get_memory(memory_id)
        self.assertEqual("New title", memory["title"])
        self.assertEqual("internal", memory["sensitivity"])

    def test_memory_import_validates_before_writing(self):
        source = Path(self.temp.name) / "invalid.json"
        source.write_text(
            json.dumps(
                [
                    {"title": "Valid", "content": "Would be valid"},
                    {"title": "", "content": "Missing title"},
                ]
            ),
            encoding="utf-8",
        )
        with self.assertRaises(ValueError):
            self.core.import_memories(source)
        self.assertEqual([], self.core.storage.list_memories())

    def test_memory_import(self):
        source = Path(self.temp.name) / "memories.json"
        source.write_text(
            json.dumps(
                {
                    "memories": [
                        {
                            "title": "Blue principle",
                            "content": "Explain important decisions.",
                            "sensitivity": "internal",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        count, identifiers = self.core.import_memories(source)
        self.assertEqual(1, count)
        self.assertEqual(1, len(identifiers))
        self.assertEqual("internal", self.core.storage.get_memory(identifiers[0])["sensitivity"])

    def test_offline_provider_status(self):
        report = self.core.provider_status()
        self.assertTrue(report["available"])
        self.assertEqual("offline", report["provider"])

    def test_source_and_citation_workflow(self):
        source_path = Path(self.temp.name) / "blue-notes.md"
        source_path.write_text(
            "# Blue\nBlue is an identity, not a device.", encoding="utf-8"
        )
        source_id = self.core.add_source(source_path, "Blue notes")
        memory_id = self.core.remember(
            "Identity principle", "Blue is an identity, not a device."
        )
        citation_id = self.core.cite_memory(
            memory_id, source_id, "Blue heading", "Founding principle"
        )
        self.assertTrue(citation_id)
        self.assertEqual(1, len(self.core.storage.list_citations(memory_id)))
        with self.assertRaises(ValueError):
            self.core.add_source(source_path, "Duplicate")

    def test_named_conversation_chat_is_persisted(self):
        conversation_id = self.core.create_conversation("Phase 1.3")
        response, decision = self.core.conversation_chat(
            conversation_id, "What mode are you running?"
        )
        self.assertEqual("allow", decision.decision.value)
        self.assertIn("local foundation mode", response)
        entries = self.core.storage.conversation_entries(conversation_id)
        self.assertEqual(["user", "assistant"], [row["role"] for row in entries])

    def test_named_conversation_passes_history_and_ranked_context_to_provider(self):
        conversation_id = self.core.create_conversation("Context test")
        self.core.conversation_chat(conversation_id, "We are improving Blue.")
        self.core.remember("Movement plan", "Use blended walk and run animation.")

        class CapturingProvider:
            name = "capture"

            def __init__(self):
                self.context = []
                self.history = []

            def generate(self, prompt, context, history=None):
                self.context = context
                self.history = history or []
                return "Context captured."

        provider = CapturingProvider()
        self.core.provider = lambda: provider
        response, _ = self.core.conversation_chat(
            conversation_id, "Tell me about the movement animation plan."
        )
        self.assertEqual("Context captured.", response)
        self.assertTrue(
            any(row["title"] == "Movement plan" for row in provider.context)
        )
        self.assertEqual(
            ["user", "assistant"], [row["role"] for row in provider.history]
        )

    def test_receipt_requires_approved_request(self):
        approval_id, _ = self.core.request_approval(
            "publish", "Publish a project update."
        )
        with self.assertRaises(ValueError):
            self.core.record_execution_receipt(
                approval_id, "succeeded", "Should not be accepted."
            )
        self.core.decide_approval(approval_id, "approved")
        receipt_id = self.core.record_execution_receipt(
            approval_id, "succeeded", "Release note published."
        )
        self.assertTrue(receipt_id)

    def test_doctor_reports_phase_13_systems(self):
        source_path = Path(self.temp.name) / "source.txt"
        source_path.write_text("Evidence", encoding="utf-8")
        self.core.add_source(source_path)
        self.core.create_conversation("Research")
        report = self.core.doctor()
        self.assertEqual(1, report["sources"])
        self.assertEqual(1, report["conversations"])
        self.assertIn(report["search_engine"], {"sqlite_fts5", "sqlite_like_fallback"})

    def test_workspace_index_is_read_only_and_ignores_internal_directories(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        (workspace_root / "app.py").write_text("print('blue')", encoding="utf-8")
        ignored = workspace_root / ".git"
        ignored.mkdir()
        (ignored / "secret.txt").write_text("do not index", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        report = self.core.index_workspace("Example")
        self.assertEqual(1, report["files_indexed"])
        self.assertEqual("read_only", report["mode"])
        self.assertEqual(
            "app.py",
            self.core.storage.list_workspace_files(
                self.core.storage.get_workspace("Example")["id"]
            )[0]["relative_path"],
        )

    def test_file_change_requires_approval_and_creates_receipt(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        target = workspace_root / "notes.md"
        target.write_text("old\n", encoding="utf-8")
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("new\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        change_id, approval_id = self.core.propose_file_change(
            "Example", "notes.md", proposal
        )
        with self.assertRaises(ValueError):
            self.core.apply_proposed_change(change_id)
        self.assertEqual("old\n", target.read_text(encoding="utf-8"))
        self.core.decide_approval(approval_id, "approved", "Reviewed diff")
        applied = self.core.apply_proposed_change(change_id)
        self.assertEqual(target, applied)
        self.assertEqual("new\n", target.read_text(encoding="utf-8"))
        receipts = self.core.storage.list_execution_receipts(approval_id)
        self.assertEqual("succeeded", receipts[0]["outcome"])
        change = self.core.storage.get_proposed_change(change_id)
        self.assertTrue(Path(change["backup_path"]).exists())

    def test_file_change_detects_race_after_approval(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        target = workspace_root / "notes.md"
        target.write_text("original\n", encoding="utf-8")
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("proposed\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        change_id, approval_id = self.core.propose_file_change(
            "Example", "notes.md", proposal
        )
        self.core.decide_approval(approval_id, "approved")
        target.write_text("changed elsewhere\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            self.core.apply_proposed_change(change_id)
        self.assertEqual("changed elsewhere\n", target.read_text(encoding="utf-8"))

    def test_file_change_rejects_path_traversal(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("content", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        with self.assertRaises(ValueError):
            self.core.propose_file_change("Example", "../escape.md", proposal)

    def test_restore_drill_uses_isolated_copy(self):
        backup = Path(self.temp.name) / "blue.db"
        self.core.backup(backup)
        report = self.core.restore_drill(backup)
        self.assertTrue(report["restore_drill"])
        self.assertTrue(report["required_tables_present"])

    def test_workspace_policy_and_freshness(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        target = workspace_root / "notes.md"
        target.write_text("indexed\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        policy = self.core.update_workspace_policy(
            "Example",
            max_file_bytes=100_000,
            max_total_bytes=1_000_000,
            allow_new_files=True,
            proposal_lifetime_hours=24,
        )
        self.assertTrue(policy["allow_new_files"])
        self.core.index_workspace("Example")
        self.assertTrue(self.core.workspace_freshness("Example")["fresh"])
        target.write_text("changed\n", encoding="utf-8")
        report = self.core.workspace_freshness("Example")
        self.assertFalse(report["fresh"])
        self.assertEqual(["notes.md"], report["changed"])

    def test_new_file_proposal_obeys_workspace_policy(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("new file\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        with self.assertRaises(ValueError):
            self.core.propose_file_change("Example", "new.md", proposal)
        self.core.update_workspace_policy(
            "Example",
            max_file_bytes=100_000,
            max_total_bytes=1_000_000,
            allow_new_files=True,
            proposal_lifetime_hours=24,
        )
        change_id, _ = self.core.propose_file_change(
            "Example", "new.md", proposal
        )
        self.assertTrue(change_id)

    def test_reject_change_denies_linked_approval(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        target = workspace_root / "notes.md"
        target.write_text("old\n", encoding="utf-8")
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("new\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        change_id, approval_id = self.core.propose_file_change(
            "Example", "notes.md", proposal
        )
        self.assertTrue(self.core.reject_proposed_change(change_id, "Not needed"))
        self.assertEqual(
            "rejected", self.core.storage.get_proposed_change(change_id)["status"]
        )
        self.assertEqual(
            "denied", self.core.storage.get_approval(approval_id)["status"]
        )

    def test_approved_rollback_restores_original(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        target = workspace_root / "notes.md"
        target.write_text("original\n", encoding="utf-8")
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("changed\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        change_id, approval_id = self.core.propose_file_change(
            "Example", "notes.md", proposal
        )
        self.core.decide_approval(approval_id, "approved")
        self.core.apply_proposed_change(change_id)
        rollback_approval = self.core.request_change_rollback(change_id)
        with self.assertRaises(ValueError):
            self.core.rollback_change(change_id)
        self.core.decide_approval(rollback_approval, "approved")
        self.core.rollback_change(change_id)
        self.assertEqual("original\n", target.read_text(encoding="utf-8"))
        self.assertEqual(
            "rolled_back",
            self.core.storage.get_proposed_change(change_id)["status"],
        )

    def test_workspace_roles_limit_operations(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        target = workspace_root / "notes.md"
        target.write_text("old\n", encoding="utf-8")
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("new\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        self.core.grant_workspace_access("Example", "reader", "viewer")
        self.core.grant_workspace_access("Example", "author", "proposer")
        with self.assertRaises(ValueError):
            self.core.propose_file_change(
                "Example", "notes.md", proposal, principal="reader"
            )
        change_id, approval_id = self.core.propose_file_change(
            "Example", "notes.md", proposal, principal="author"
        )
        self.core.decide_approval(approval_id, "approved")
        with self.assertRaises(ValueError):
            self.core.apply_proposed_change(change_id, principal="author")
        self.core.grant_workspace_access("Example", "maintainer", "maintainer")
        self.core.apply_proposed_change(change_id, principal="maintainer")
        self.assertEqual("new\n", target.read_text(encoding="utf-8"))
        self.assertFalse(self.core.revoke_workspace_access("Example", "creator"))

    def test_signed_proposal_detects_tampering(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        target = workspace_root / "notes.md"
        target.write_text("old\n", encoding="utf-8")
        proposal = Path(self.temp.name) / "proposal.md"
        proposal.write_text("new\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        change_id, _ = self.core.propose_file_change(
            "Example", "notes.md", proposal
        )
        bundle = Path(self.temp.name) / "proposal.json"
        self.core.export_signed_proposal(change_id, bundle)
        self.assertTrue(self.core.verify_signed_proposal(bundle)["signature_valid"])
        payload = json.loads(bundle.read_text(encoding="utf-8"))
        payload["payload"]["relative_path"] = "tampered.md"
        bundle.write_text(json.dumps(payload), encoding="utf-8")
        self.assertFalse(self.core.verify_signed_proposal(bundle)["signature_valid"])

    def test_backup_maintenance_records_verification(self):
        backup_dir = Path(self.temp.name) / "backups"
        backup_dir.mkdir()
        self.core.backup(backup_dir / "blue.db")
        self.core.configure_backup_verification_schedule(12)
        report = self.core.run_backup_maintenance(backup_dir, force=True)
        self.assertTrue(report["all_valid"])
        self.assertEqual(
            1, len(self.core.storage.list_backup_verifications())
        )
        status = self.core.backup_maintenance_status()
        self.assertFalse(status["due"])
        self.assertEqual(12, status["interval_hours"])

    def test_principal_authentication_and_protected_vault(self):
        self.core.create_principal(
            "alice", "Alice", "correct horse battery staple"
        )
        self.assertTrue(
            self.core.authenticate_principal(
                "alice", "correct horse battery staple"
            )
        )
        self.assertFalse(self.core.authenticate_principal("alice", "wrong password"))
        self.core.vault_set(
            "api_key",
            "super-secret-value",
            "alice",
            "correct horse battery staple",
        )
        record = self.core.storage.get_secret("api_key")
        self.assertNotIn(b"super-secret-value", record["encrypted_blob"])
        self.assertEqual(
            "super-secret-value",
            self.core.vault_get(
                "api_key", "alice", "correct horse battery staple"
            ),
        )
        self.assertTrue(
            self.core.vault_delete(
                "api_key", "alice", "correct horse battery staple"
            )
        )

    def test_approval_quorum_requires_distinct_principals(self):
        self.core.create_principal("alice", "Alice", "alice secure password")
        self.core.create_principal("bob", "Bob", "bob secure password12")
        approval_id, _ = self.core.request_approval(
            "publish",
            "Publish a release.",
            required_votes=2,
        )
        self.assertTrue(
            self.core.vote_approval(approval_id, "alice", "approved")
        )
        self.assertEqual(
            "pending", self.core.storage.get_approval(approval_id)["status"]
        )
        self.assertFalse(
            self.core.vote_approval(approval_id, "alice", "approved")
        )
        self.assertTrue(
            self.core.vote_approval(approval_id, "bob", "approved")
        )
        self.assertEqual(
            "approved", self.core.storage.get_approval(approval_id)["status"]
        )

    def test_signed_release_manifest_checks_signature_and_files(self):
        app_root = Path(self.temp.name) / "app"
        app_root.mkdir()
        source = app_root / "app.py"
        source.write_text("print('blue')\n", encoding="utf-8")
        (app_root / "BUILD_STATUS.md").write_text("mutable\n", encoding="utf-8")
        manifest = Path(self.temp.name) / "release.json"
        self.core.create_release_manifest(app_root, manifest)
        manifest_payload = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertNotIn(
            "BUILD_STATUS.md",
            [row["path"] for row in manifest_payload["payload"]["files"]],
        )
        report = self.core.verify_release_manifest(manifest, app_root)
        self.assertTrue(report["signature_valid"])
        self.assertTrue(report["files_match"])
        source.write_text("print('changed')\n", encoding="utf-8")
        report = self.core.verify_release_manifest(manifest, app_root)
        self.assertTrue(report["signature_valid"])
        self.assertFalse(report["files_match"])

    def test_onboarding_configures_creator_and_backup_cadence(self):
        report = self.core.onboard(
            "Blue Test", "creator secure password", backup_interval_hours=8
        )
        self.assertEqual("Blue Test", report["identity_name"])
        self.assertTrue(
            self.core.authenticate_principal(
                "creator", "creator secure password"
            )
        )
        self.assertEqual(
            8, self.core.backup_maintenance_status()["interval_hours"]
        )

    def test_readable_export_excludes_signing_keys(self):
        destination = Path(self.temp.name) / "safe-export.json"
        self.core.export(destination)
        payload = json.loads(destination.read_text(encoding="utf-8"))
        self.assertNotIn("proposal_hmac_key", payload["metadata"])
        self.assertNotIn("release_hmac_key", payload["metadata"])

    def test_forge_artifact_records_provenance_and_sources(self):
        source_path = Path(self.temp.name) / "source.md"
        source_path.write_text("Portable identity evidence", encoding="utf-8")
        source_id = self.core.add_source(source_path, "Identity evidence")
        content = Path(self.temp.name) / "artifact.md"
        content.write_text("# Design\nPortable identity", encoding="utf-8")
        artifact_id = self.core.create_forge_artifact(
            "Identity design", "document", content, [source_id]
        )
        artifact = self.core.storage.get_forge_artifact(artifact_id)
        self.assertEqual("document", artifact["kind"])
        self.assertEqual(
            hashlib.sha256(artifact["content"].encode("utf-8")).hexdigest(),
            artifact["sha256"],
        )
        provenance = json.loads(artifact["provenance_json"])
        self.assertEqual(
            hashlib.sha256(content.read_bytes()).hexdigest(),
            provenance["input_sha256"],
        )
        linked = self.core.storage.connection.execute(
            "SELECT source_id FROM forge_artifact_sources WHERE artifact_id = ?",
            (artifact_id,),
        ).fetchone()[0]
        self.assertEqual(source_id, linked)

    def test_forge_template_creates_artifact_and_approval_gated_proposal(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        self.core.register_workspace("Example", workspace_root)
        self.core.update_workspace_policy(
            "Example",
            max_file_bytes=500_000,
            max_total_bytes=1_000_000,
            allow_new_files=True,
            proposal_lifetime_hours=24,
        )
        result = self.core.forge_template(
            "Example", "python_cli", "main.py"
        )
        self.assertTrue(self.core.storage.get_forge_artifact(result["artifact_id"]))
        change = self.core.storage.get_proposed_change(result["change_id"])
        self.assertEqual("proposed", change["status"])
        self.assertEqual(
            "pending",
            self.core.storage.get_approval(result["approval_id"])["status"],
        )
        self.assertFalse((workspace_root / "main.py").exists())

    def test_allowlisted_compile_runner_requires_approval(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        (workspace_root / "app.py").write_text("value = 42\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        run_id, approval_id = self.core.request_execution_run(
            "Example", "python_compile"
        )
        with self.assertRaises(ValueError):
            self.core.execute_run(run_id)
        self.core.decide_approval(approval_id, "approved")
        report = self.core.execute_run(run_id)
        self.assertEqual("succeeded", report["status"])
        self.assertEqual(0, report["exit_code"])
        self.assertIn("not an OS security sandbox", report["boundary"])

    def test_runner_rejects_modified_command(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        self.core.register_workspace("Example", workspace_root)
        run_id, approval_id = self.core.request_execution_run(
            "Example", "python_compile"
        )
        self.core.decide_approval(approval_id, "approved")
        self.core.storage.connection.execute(
            "UPDATE execution_runs SET command_json = ? WHERE id = ?",
            (json.dumps(["dangerous", "command"]), run_id),
        )
        self.core.storage.connection.commit()
        with self.assertRaises(ValueError):
            self.core.execute_run(run_id)

    def test_academy_answers_only_from_stored_citations(self):
        source_path = Path(self.temp.name) / "lesson.md"
        source_path.write_text(
            "Portable identity allows Blue to move between trusted hosts.",
            encoding="utf-8",
        )
        source_id = self.core.add_source(source_path, "Portable identity lesson")
        report = self.core.academy_ask("portable identity")
        self.assertEqual(source_id, report["citations"][0]["source_id"])
        self.assertIn("[1]", report["answer"])
        unsupported = self.core.academy_ask("quantum bananas")
        self.assertEqual([], unsupported["citations"])
        self.assertIn("no stored source", unsupported["answer"])

    def test_forge_artifact_release_is_approved_and_signed(self):
        content = Path(self.temp.name) / "artifact.md"
        content.write_text("Release content", encoding="utf-8")
        artifact_id = self.core.create_forge_artifact(
            "Release design", "document", content
        )
        approval_id = self.core.request_artifact_release(artifact_id)
        with self.assertRaises(ValueError):
            self.core.release_artifact(artifact_id)
        self.core.decide_approval(approval_id, "approved")
        release = self.core.release_artifact(artifact_id)
        self.assertEqual("HMAC-SHA256", release["signature_algorithm"])
        verification = self.core.verify_artifact_release(artifact_id)
        self.assertTrue(verification["signature_valid"])
        self.assertTrue(verification["content_match"])
        self.core.storage.connection.execute(
            "UPDATE forge_artifacts SET content = 'tampered' WHERE id = ?",
            (artifact_id,),
        )
        self.core.storage.connection.commit()
        verification = self.core.verify_artifact_release(artifact_id)
        self.assertFalse(verification["content_match"])

    def test_runner_policy_defaults_to_compile_only(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        self.core.register_workspace("Example", workspace_root)
        policies = {
            row["runner"]: bool(row["enabled"])
            for row in self.core.runner_policy("Example")
        }
        self.assertTrue(policies["python_compile"])
        self.assertFalse(policies["python_unittest"])
        with self.assertRaises(ValueError):
            self.core.request_execution_run("Example", "python_unittest")
        self.core.set_runner_policy("Example", "python_unittest", True)
        run_id, _ = self.core.request_execution_run(
            "Example", "python_unittest"
        )
        self.assertTrue(run_id)

    def test_runner_result_attestation_detects_tampering(self):
        workspace_root = Path(self.temp.name) / "workspace"
        workspace_root.mkdir()
        (workspace_root / "app.py").write_text("value = 42\n", encoding="utf-8")
        self.core.register_workspace("Example", workspace_root)
        run_id, approval_id = self.core.request_execution_run(
            "Example", "python_compile"
        )
        self.core.decide_approval(approval_id, "approved")
        self.core.execute_run(run_id)
        verification = self.core.verify_execution_run(run_id)
        self.assertTrue(verification["hash_valid"])
        self.assertTrue(verification["signature_valid"])
        self.core.storage.connection.execute(
            "UPDATE execution_runs SET stdout = 'tampered' WHERE id = ?",
            (run_id,),
        )
        self.core.storage.connection.commit()
        verification = self.core.verify_execution_run(run_id)
        self.assertFalse(verification["hash_valid"])
        self.assertFalse(verification["signature_valid"])

    def test_academy_lesson_requires_and_cites_sources(self):
        with self.assertRaises(ValueError):
            self.core.academy_create_lesson("portable identity")
        source_path = Path(self.temp.name) / "lesson.md"
        source_path.write_text(
            "Portable identity preserves Blue across trusted hardware.",
            encoding="utf-8",
        )
        source_id = self.core.add_source(source_path, "Identity source")
        lesson = self.core.academy_create_lesson("portable identity")
        self.assertEqual(source_id, lesson["citations"][0]["source_id"])
        self.assertIn("Review questions", lesson["content"])
        self.assertEqual(
            hashlib.sha256(lesson["content"].encode("utf-8")).hexdigest(),
            lesson["content_sha256"],
        )

    def test_forge_bundle_creates_four_linked_proposals_without_writes(self):
        workspace_root = Path(self.temp.name) / "bundle-workspace"
        workspace_root.mkdir()
        self.core.register_workspace("Bundle Example", workspace_root)
        self.core.update_workspace_policy(
            "Bundle Example",
            max_file_bytes=500_000,
            max_total_bytes=1_000_000,
            allow_new_files=True,
            proposal_lifetime_hours=24,
        )
        result = self.core.forge_bundle(
            "Bundle Example", "python_starter", "Helpful Tool"
        )
        self.assertEqual(4, len(result["items"]))
        self.assertEqual(0, result["workspace_writes"])
        self.assertEqual([], list(workspace_root.iterdir()))
        stored_items = self.core.storage.list_forge_bundle_items(
            result["bundle_id"]
        )
        self.assertEqual(4, len(stored_items))
        self.assertEqual(
            {"README.md", "main.py", "pyproject.toml", "test_main.py"},
            {row["relative_path"] for row in stored_items},
        )
        for item in result["items"]:
            self.assertEqual(
                "proposed",
                self.core.storage.get_proposed_change(item["change_id"])["status"],
            )
            self.assertEqual(
                "pending",
                self.core.storage.get_approval(item["approval_id"])["status"],
            )

    def test_forge_bundle_respects_new_file_policy(self):
        workspace_root = Path(self.temp.name) / "closed-workspace"
        workspace_root.mkdir()
        self.core.register_workspace("Closed Example", workspace_root)
        with self.assertRaisesRegex(ValueError, "does not allow"):
            self.core.forge_bundle(
                "Closed Example", "python_starter", "Blocked Tool"
            )
        self.assertEqual([], self.core.storage.list_forge_bundles())
        self.assertEqual([], self.core.storage.list_forge_artifacts())

    def test_forge_bundle_records_artifact_relationships(self):
        workspace_root = Path(self.temp.name) / "related-workspace"
        workspace_root.mkdir()
        self.core.register_workspace("Related Example", workspace_root)
        self.core.update_workspace_policy(
            "Related Example",
            max_file_bytes=500_000,
            max_total_bytes=1_000_000,
            allow_new_files=True,
            proposal_lifetime_hours=24,
        )
        result = self.core.forge_bundle(
            "Related Example", "python_starter", "Related Tool"
        )
        relations = self.core.storage.connection.execute(
            "SELECT * FROM forge_artifact_relations"
        ).fetchall()
        self.assertEqual(3, len(relations))
        self.assertEqual({"contains"}, {row["relation"] for row in relations})
        artifact_ids = {item["artifact_id"] for item in result["items"]}
        self.assertTrue(
            all(row["parent_artifact_id"] in artifact_ids for row in relations)
        )

    def test_academy_assessment_requires_a_cited_lesson(self):
        with self.assertRaisesRegex(ValueError, "lesson not found"):
            self.core.academy_create_assessment("missing")
        source_path = Path(self.temp.name) / "assessment-source.md"
        source_path.write_text(
            "Portable identity preserves knowledge across trusted hosts.",
            encoding="utf-8",
        )
        source_id = self.core.add_source(source_path, "Assessment evidence")
        lesson = self.core.academy_create_lesson("portable identity")
        assessment = self.core.academy_create_assessment(lesson["lesson_id"])
        self.assertEqual("human_review_required", assessment["grading"])
        self.assertEqual(3, len(assessment["questions"]))
        self.assertEqual(
            [source_id], assessment["questions"][1]["evidence_scope"]
        )
        stored = self.core.storage.get_academy_assessment(
            assessment["assessment_id"]
        )
        self.assertEqual(
            assessment["questions"], json.loads(stored["questions_json"])
        )
        self.assertTrue(
            all(
                row["automatic_score"] is False
                for row in json.loads(stored["rubric_json"])
            )
        )

    def test_academy_submission_requires_all_answers_and_stays_unscored(self):
        source_path = Path(self.temp.name) / "submission-source.md"
        source_path.write_text(
            "Citations connect claims to stored evidence.", encoding="utf-8"
        )
        self.core.add_source(source_path, "Submission evidence")
        lesson = self.core.academy_create_lesson("citations")
        assessment = self.core.academy_create_assessment(lesson["lesson_id"])
        with self.assertRaisesRegex(ValueError, "exactly 3"):
            self.core.academy_submit_assessment(
                assessment["assessment_id"], "learner", ["one"]
            )
        result = self.core.academy_submit_assessment(
            assessment["assessment_id"],
            "learner",
            ["Claim and citation.", "Evidence relevance.", "Verify uncertainty."],
        )
        self.assertEqual("submitted_for_review", result["status"])
        self.assertIsNone(result["score"])
        stored = self.core.storage.list_academy_submissions(
            assessment["assessment_id"]
        )[0]
        self.assertEqual("submitted_for_review", stored["status"])

    def test_activation_creates_and_resumes_persistent_safe_session(self):
        first = self.core.activate_session("Build Together")
        self.assertFalse(first["resumed"])
        self.assertEqual(
            "persistent named conversation", first["capabilities"]["talk"]
        )
        self.assertIn("approval-gated", first["capabilities"]["make"])
        response, decision = self.core.conversation_chat(
            first["conversation_id"], "Hello Blue"
        )
        self.assertIn("Blue", response)
        self.assertEqual("allow", decision.decision.value)
        second = self.core.activate_session("build together")
        self.assertTrue(second["resumed"])
        self.assertEqual(first["conversation_id"], second["conversation_id"])
        entries = self.core.storage.conversation_entries(
            first["conversation_id"]
        )
        self.assertEqual(2, len(entries))


if __name__ == "__main__":
    unittest.main()
