"""First working Blue Companion prototype summary."""
from __future__ import annotations
from .animation import AvatarInteractionService
from .art import CreationPipelinePlanner, ReferenceItem
from .learning import LearningPlanner
from .messaging import BlueMessageRelay
from .model import CompanionPrototypeSummary
from .obs import OBSControlPlanner
from .registry import BlueCompanionRegistry
from .social import SocialPostQueue
from .streaming import StreamBrainPlanner
from .vision import VisionIntakePlanner


def build_companion_prototype() -> CompanionPrototypeSummary:
    registry = BlueCompanionRegistry()
    avatar = AvatarInteractionService()
    file_plan = avatar.interact_with_file(r"C:\Users\adahn\Downloads\example.png", 0.86)
    drag_plan = avatar.drag_plan()
    relay = BlueMessageRelay()
    message = relay.draft_message("qwen", "Blue update ready for review. Please sync through BlueMesh.")
    message_plan = relay.plan_send(message)
    obs_plan = OBSControlPlanner().scene_change("Blue Companion")
    stream_plan = StreamBrainPlanner().neuro_style_stream_plan()
    vision_plan = VisionIntakePlanner().analyze_user_file(r"C:\Users\adahn\Downloads\unknown-33-2.webp", "avatar reference")
    art_plan = CreationPipelinePlanner().reference_pack([
        ReferenceItem(r"C:\Users\adahn\Downloads\unknown-13-2.webp", "body reference", 0.7),
        ReferenceItem(r"C:\Users\adahn\Downloads\unknown-33-2.webp", "outfit reference", 0.9),
    ])
    lesson_plan = LearningPlanner().teach_topic("drawing Blue's character design", "step-by-step practice")
    social_plan = SocialPostQueue().draft_post("discord", "Project Blue update is ready for review.")
    return CompanionPrototypeSummary(
        blue_identity_rule="Blue may have many devices and creators, but only one shared Blue identity.",
        capabilities=len(registry.all()),
        generated_plans=(file_plan, drag_plan, message_plan, obs_plan, stream_plan, vision_plan, art_plan, lesson_plan, social_plan),
        notes=(
            "Prototype creates action plans only; real external sends require creator approval and connector tokens.",
            "Animation work is organized around taskbar-as-floor, one-file-at-a-time interaction, and transparent neck drag.",
            "Creation pipeline uses reference manifests so many inputs do not confuse identity/outfit/pose/color roles.",
        ),
    )
