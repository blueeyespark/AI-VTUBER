import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from blue_workspace import BlueWorkspaceAgent
from blue_workspace.safety import CommandPolicy, PathPolicy, SecretFilter


class BlueWorkspaceAgentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="blue_workspace_agent_"))
        (self.tmp / ".gitignore").write_text("node_modules\n.env\n", encoding="utf-8")
        (self.tmp / "README.md").write_text("# Demo\nBlue workspace agent fixture\n", encoding="utf-8")
        (self.tmp / "src").mkdir()
        (self.tmp / "src" / "control.js").write_text(
            "function routeBlueChat(message) { return message; }\nconst helper = () => true;\n",
            encoding="utf-8",
        )
        (self.tmp / "node_modules").mkdir()
        (self.tmp / "node_modules" / "ignored.js").write_text("function ignored() {}", encoding="utf-8")
        (self.tmp / ".env").write_text("API_KEY=super-secret\n", encoding="utf-8")
        subprocess.run(["git", "init"], cwd=self.tmp, check=True, capture_output=True, text=True)
        self.agent = BlueWorkspaceAgent(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_workspace_context_detects_root_git_and_languages(self):
        context = self.agent.workspace_context(active_file="src/control.js", selected_lines=24)
        self.assertEqual(context["project_name"], self.tmp.name)
        self.assertEqual(context["active_file"], "src/control.js")
        self.assertEqual(context["selected_lines"], 24)
        self.assertIn(".md", context["detected_languages"])
        self.assertIn(".js", context["detected_languages"])
        self.assertGreaterEqual(context["modified_files"], 1)

    def test_directory_tree_respects_ignored_binary_and_dependency_paths(self):
        entries = self.agent.project_tree(max_depth=3)["entries"]
        paths = {entry["path"] for entry in entries}
        self.assertIn("src/control.js", paths)
        self.assertNotIn("node_modules/ignored.js", paths)
        self.assertNotIn(".env", paths)

    def test_read_file_blocks_outside_sensitive_and_binary_paths(self):
        text = self.agent.read_file("src/control.js")
        self.assertIn("routeBlueChat", text["text"])
        with self.assertRaises(PermissionError):
            self.agent.read_file("../outside.txt")
        with self.assertRaises(PermissionError):
            self.agent.read_file(".env")

    def test_search_code_and_symbols_return_clickable_references(self):
        results = self.agent.search_code("routeBlueChat")["results"]
        self.assertEqual(results[0]["path"], "src/control.js")
        self.assertEqual(results[0]["line"], 1)
        symbols = self.agent.search_symbols("routeBlue")["results"]
        self.assertEqual(symbols[0]["symbol"], "routeBlueChat")

    def test_plan_mode_creates_bounded_non_writing_task(self):
        task = self.agent.create_plan("Fix all broken imports")
        self.assertEqual(task["status"], "planned")
        self.assertEqual(task["mode"], "plan")
        self.assertIn("Request approval before modifying files", task["plan"])

    def test_slash_commands_and_git_status_are_read_only(self):
        self.assertEqual(self.agent.slash_command("/workspace")["type"], "workspace")
        self.assertEqual(self.agent.slash_command("/search routeBlueChat")["type"], "search")
        status = self.agent.slash_command("/git")
        self.assertEqual(status["type"], "git")
        self.assertTrue(status["data"]["ok"])

    def test_secret_filter_and_command_policy(self):
        self.assertIn("[REDACTED]", SecretFilter().redact("token=abc123"))
        policy = CommandPolicy()
        self.assertEqual(policy.classify(["git", "status"]), "read_only_or_verification")
        self.assertEqual(policy.classify(["git", "reset", "--hard"]), "requires_explicit_approval")


if __name__ == "__main__":
    unittest.main()

