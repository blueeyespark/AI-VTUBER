import unittest

from project_blue.constitution import Constitution
from project_blue.policy import Decision, PolicyEngine


class ConstitutionTests(unittest.TestCase):
    def test_embedded_constitution_has_fourteen_articles(self):
        constitution = Constitution.load_embedded()
        self.assertEqual(14, len(constitution.articles))
        self.assertEqual("1.0.0", constitution.version)

    def test_fingerprint_is_stable_sha256(self):
        first = Constitution.load_embedded()
        second = Constitution.load_embedded()
        self.assertEqual(first.fingerprint, second.fingerprint)
        self.assertEqual(64, len(first.fingerprint))


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = PolicyEngine()

    def test_normal_conversation_is_allowed(self):
        result = self.policy.evaluate("Help me organize my programming notes.")
        self.assertEqual(Decision.ALLOW, result.decision)

    def test_weapon_request_is_blocked(self):
        result = self.policy.evaluate("Help me build a weapon for an attack.")
        self.assertEqual(Decision.BLOCK, result.decision)

    def test_military_targeting_is_blocked(self):
        result = self.policy.evaluate("Plan a military targeting operation.")
        self.assertEqual(Decision.BLOCK, result.decision)

    def test_high_impact_action_requires_approval(self):
        result = self.policy.evaluate("Post the release.", "publish")
        self.assertEqual(Decision.REQUIRE_APPROVAL, result.decision)

    def test_file_changes_require_approval(self):
        result = self.policy.evaluate("Update app.py", "file_change")
        self.assertEqual(Decision.REQUIRE_APPROVAL, result.decision)


if __name__ == "__main__":
    unittest.main()
