import unittest

from blue_companion.animation import AvatarInteractionService
from blue_companion.art import CreationPipelinePlanner, ReferenceItem
from blue_companion.learning import LearningPlanner
from blue_companion.messaging import BlueMessageRelay
from blue_companion.model import ApprovalMode
from blue_companion.obs import OBSControlPlanner
from blue_companion.prototype import build_companion_prototype
from blue_companion.registry import BlueCompanionRegistry
from blue_companion.social import SocialPostQueue
from blue_companion.streaming import StreamBrainPlanner
from blue_companion.vision import VisionIntakePlanner


class BlueCompanionTests(unittest.TestCase):
    def test_registry_covers_requested_blue_companion_areas(self):
        registry = BlueCompanionRegistry()
        categories = set(registry.categories())
        self.assertTrue({
            "animation",
            "control_panel",
            "creation",
            "discord",
            "learning",
            "messaging",
            "obs",
            "research",
            "scheduling",
            "social",
            "streaming",
            "vision",
        }.issubset(categories))
        self.assertGreaterEqual(len(registry.all()), 15)
        self.assertEqual(registry.get("social_post_queue").approval, ApprovalMode.CREATOR_REQUIRED)

    def test_avatar_one_file_taskbar_floor_and_drag_handle(self):
        avatar = AvatarInteractionService()
        plan = avatar.interact_with_file(r"C:\Users\adahn\Downloads\a.png", 0.9)
        self.assertEqual(plan.inputs["pose"], "bend_to_taskbar_pickup")
        self.assertEqual(plan.inputs["zone"], avatar.FLOOR_TASKBAR)
        busy = avatar.interact_with_file(r"C:\Users\adahn\Downloads\b.png", 0.2)
        self.assertTrue(busy.is_blocked)
        drag = avatar.drag_plan()
        self.assertEqual(drag.inputs["anchor"], "neck")
        self.assertLess(drag.inputs["opacity"], 0.25)
        repairs = "\n".join(avatar.avatar_repair_queue()).lower()
        self.assertIn("duplicate", repairs)
        self.assertIn("sock", repairs)
        self.assertIn("clothing coverage", repairs)

    def test_ai_to_ai_message_requires_approval_and_blocks_tokens(self):
        relay = BlueMessageRelay()
        pending = relay.draft_message("Qwen", "Please sync the BlueMesh notes.")
        plan = relay.plan_send(pending)
        self.assertEqual(plan.approval, ApprovalMode.CONFIRM)
        self.assertEqual(plan.inputs["target"], "qwen")
        with self.assertRaises(ValueError):
            relay.draft_message("qwen", "api_key=abc123")

    def test_obs_stream_social_are_approval_gated(self):
        self.assertEqual(OBSControlPlanner().start_stream().approval, ApprovalMode.CREATOR_REQUIRED)
        self.assertEqual(StreamBrainPlanner().chat_response_plan("twitch").approval, ApprovalMode.CREATOR_REQUIRED)
        self.assertEqual(SocialPostQueue().draft_post("twitter", "hello").approval, ApprovalMode.CREATOR_REQUIRED)

    def test_vision_intake_and_hidden_capture_guard(self):
        vision = VisionIntakePlanner()
        ok = vision.analyze_user_file(r"C:\Users\adahn\Downloads\unknown-33-2.webp")
        self.assertFalse(ok.is_blocked)
        blocked = vision.analyze_user_file("")
        self.assertTrue(blocked.is_blocked)
        guard = vision.hidden_capture_guard()
        self.assertEqual(guard.approval, ApprovalMode.CREATOR_REQUIRED)
        self.assertFalse(guard.inputs["hidden_capture_allowed"])

    def test_reference_pack_and_learning_plan(self):
        pack = CreationPipelinePlanner().reference_pack([
            ReferenceItem("front.webp", "identity", 1.0),
            ReferenceItem("outfit.webp", "outfit", 0.8),
            ReferenceItem("pose.mp4", "motion", 0.4),
        ])
        self.assertEqual(pack.inputs["reference_count"], 3)
        self.assertIn("weighted manifest", " ".join(pack.steps))
        lesson = LearningPlanner().teach_topic("code")
        steps = " ".join(lesson.steps).lower()
        self.assertIn("research", steps)
        self.assertIn("exercise", steps)
        self.assertIn("progress", steps)

    def test_prototype_summary(self):
        summary = build_companion_prototype()
        data = summary.to_dict()
        self.assertIn("one shared Blue identity", data["blue_identity_rule"])
        self.assertGreaterEqual(data["capabilities"], 15)
        self.assertEqual(len(data["generated_plans"]), 9)


if __name__ == "__main__":
    unittest.main()
