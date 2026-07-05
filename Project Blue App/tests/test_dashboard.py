import http.client
import tempfile
import threading
import unittest
from pathlib import Path

from project_blue.core import BlueCore
from project_blue.dashboard import create_dashboard_server, render_dashboard


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.core = BlueCore(Path(self.temp.name) / "blue-home")
        self.core.initialize()

    def tearDown(self):
        self.core.close()
        self.temp.cleanup()

    def _request(self, server, method, path, body=None, headers=None):
        result = {}

        def client():
            connection = http.client.HTTPConnection(
                server.server_address[0], server.server_address[1], timeout=5
            )
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            result["status"] = response.status
            result["headers"] = dict(response.getheaders())
            result["body"] = response.read().decode("utf-8")
            connection.close()

        thread = threading.Thread(target=client)
        thread.start()
        server.handle_request()
        thread.join(timeout=5)
        self.assertFalse(thread.is_alive())
        return result

    def test_rejects_non_loopback_binding(self):
        with self.assertRaises(ValueError):
            create_dashboard_server(self.core, "0.0.0.0", 0)

    def test_render_escapes_memory_content(self):
        self.core.remember("<script>", "<img src=x onerror=alert(1)>")
        page = render_dashboard(self.core, "token")
        self.assertNotIn("<script>", page)
        self.assertNotIn("<img src=x", page)
        self.assertIn("&lt;script&gt;", page)

    def test_requires_login_cookie(self):
        server = create_dashboard_server(self.core, port=0, token="test-token")
        try:
            response = self._request(server, "GET", "/")
            self.assertEqual(403, response["status"])
        finally:
            server.server_close()

    def test_login_and_csrf_protection(self):
        server = create_dashboard_server(self.core, port=0, token="test-token")
        try:
            login = self._request(server, "GET", "/login?token=test-token")
            self.assertEqual(303, login["status"])
            cookie = login["headers"]["Set-Cookie"].split(";", 1)[0]
            page = self._request(server, "GET", "/", headers={"Cookie": cookie})
            self.assertEqual(200, page["status"])
            self.assertIn("Project Blue", page["body"])
            rejected = self._request(
                server,
                "POST",
                "/memory",
                body="title=Nope&content=MissingToken",
                headers={
                    "Cookie": cookie,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            self.assertEqual(403, rejected["status"])
        finally:
            server.server_close()

    def test_dashboard_can_create_named_conversation(self):
        server = create_dashboard_server(self.core, port=0, token="test-token")
        try:
            login = self._request(server, "GET", "/login?token=test-token")
            cookie = login["headers"]["Set-Cookie"].split(";", 1)[0]
            response = self._request(
                server,
                "POST",
                "/conversation",
                body="csrf=test-token&title=Research",
                headers={
                    "Cookie": cookie,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            self.assertEqual(303, response["status"])
            self.assertEqual("Research", self.core.storage.list_conversations()[0]["title"])
        finally:
            server.server_close()

    def test_dashboard_escapes_and_displays_diff_review(self):
        workspace_id = self.core.storage.register_workspace(
            "Example", str(Path(self.temp.name) / "workspace")
        )
        approval_id = self.core.storage.request_approval(
            "file_change", "Review change"
        )
        self.core.storage.create_proposed_change(
            workspace_id,
            "app.py",
            "MISSING",
            "print('new')",
            "--- a/app.py\n+++ b/app.py\n+<script>alert(1)</script>\n",
            approval_id,
        )
        page = render_dashboard(self.core, "token")
        self.assertIn("Approve diff", page)
        self.assertNotIn("<script>alert(1)</script>", page)
        self.assertIn("&lt;script&gt;", page)

    def test_dashboard_displays_workspace_roles(self):
        workspace_id = self.core.storage.register_workspace(
            "Example", str(Path(self.temp.name) / "workspace")
        )
        self.core.storage.set_workspace_access(workspace_id, "reviewer", "viewer")
        page = render_dashboard(self.core, "token")
        self.assertIn("reviewer=viewer", page)

    def test_dashboard_displays_forge_and_academy_records(self):
        content = Path(self.temp.name) / "artifact.md"
        content.write_text("Forge content", encoding="utf-8")
        self.core.create_forge_artifact(
            "Forge design", "document", content
        )
        self.core.academy_ask("unsupported topic")
        source_path = Path(self.temp.name) / "source.md"
        source_path.write_text(
            "Portable identity preserves knowledge.", encoding="utf-8"
        )
        self.core.add_source(source_path, "Lesson source")
        lesson = self.core.academy_create_lesson("portable identity")
        assessment = self.core.academy_create_assessment(lesson["lesson_id"])
        self.core.academy_submit_assessment(
            assessment["assessment_id"],
            "dashboard learner",
            ["Claim with citation.", "Relevant evidence.", "Verify uncertainty."],
        )
        workspace_root = Path(self.temp.name) / "bundle-dashboard"
        workspace_root.mkdir()
        self.core.register_workspace("Dashboard bundle", workspace_root)
        self.core.update_workspace_policy(
            "Dashboard bundle",
            max_file_bytes=500_000,
            max_total_bytes=1_000_000,
            allow_new_files=True,
            proposal_lifetime_hours=24,
        )
        self.core.forge_bundle(
            "Dashboard bundle", "python_starter", "Dashboard Starter"
        )
        page = render_dashboard(self.core, "token")
        self.assertIn("Forge design", page)
        self.assertIn("unsupported topic", page)
        self.assertIn("Blue Academy Lesson", page)
        self.assertIn("Dashboard Starter", page)
        self.assertIn("Assessment: Blue Academy Lesson", page)
        self.assertIn("dashboard learner", page)
        self.assertIn("v2.2.0", page)


if __name__ == "__main__":
    unittest.main()
