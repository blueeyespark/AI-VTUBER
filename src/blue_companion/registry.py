"""Capability registry for the full Project Blue companion vision."""
from __future__ import annotations
from .model import ApprovalMode, CapabilityStatus, CompanionCapability, SafetyLevel

class BlueCompanionRegistry:
    def __init__(self) -> None:
        self._capabilities = _build_capabilities()
    def all(self) -> tuple[CompanionCapability, ...]:
        return tuple(sorted(self._capabilities, key=lambda item: (item.category, item.key)))
    def by_category(self, category: str) -> tuple[CompanionCapability, ...]:
        c = category.strip().lower()
        return tuple(item for item in self.all() if item.category == c)
    def get(self, key: str) -> CompanionCapability:
        k = key.strip().lower()
        for item in self._capabilities:
            if item.key == k:
                return item
        raise KeyError(f"Unknown Blue companion capability: {key}")
    def categories(self) -> tuple[str, ...]:
        return tuple(sorted({item.category for item in self._capabilities}))

def _cap(key, name, category, status, safety, approval, summary, stores=False, token=False, notes=()):
    return CompanionCapability(key, name, category, status, safety, approval, summary, stores, token, notes)

def _build_capabilities() -> tuple[CompanionCapability, ...]:
    return (
        _cap("avatar_interact_one_file", "Avatar file interaction", "animation", CapabilityStatus.PROTOTYPE, SafetyLevel.LOW, ApprovalMode.NONE, "Blue interacts with one selected file at a time: bends toward the taskbar floor or reaches toward display-level items.", notes=("VRM humanoid avatar pipeline", "Live2D motion/expression/physics model")),
        _cap("avatar_roaming_locomotion", "Roaming movement", "animation", CapabilityStatus.PROTOTYPE, SafetyLevel.LOW, ApprovalMode.NONE, "Walk, run, wave, idle, look, smile, drag, and screen-edge reactions are planned as state-machine motions instead of stuck poses."),
        _cap("blueeyespark_asset_repair", "Blueeyespark avatar repair queue", "animation", CapabilityStatus.PLANNED, SafetyLevel.MEDIUM, ApprovalMode.CONFIRM, "Tracks duplicate socks, clothing coverage, hair stiffness, tail follow-through, and non-T-pose defaults.", True),
        _cap("control_center_workbench", "Control center workbench", "control_panel", CapabilityStatus.PROTOTYPE, SafetyLevel.LOW, ApprovalMode.NONE, "Organizes chat, files, creation, motion, Discord, OBS, security, BlueMesh, learning, and approvals into a VS Code/ChatGPT-style workbench."),
        _cap("discord_bot_control", "Discord bot control", "discord", CapabilityStatus.PROTOTYPE, SafetyLevel.HIGH, ApprovalMode.CREATOR_REQUIRED, "Drafts Discord replies, command actions, and moderation-safe bot operations without exposing bot tokens.", False, True, ("Discord Developer Platform bots/interactions/gateway docs",)),
        _cap("stream_chat_interaction", "Stream chat interaction", "streaming", CapabilityStatus.PROTOTYPE, SafetyLevel.HIGH, ApprovalMode.CREATOR_REQUIRED, "Reads approved Twitch/EventSub chat events and queues Blue responses with mention/all response modes.", False, True, ("Twitch EventSub channel.chat.message docs",)),
        _cap("obs_scene_helper", "OBS scene helper", "obs", CapabilityStatus.PROTOTYPE, SafetyLevel.HIGH, ApprovalMode.CREATOR_REQUIRED, "Plans OBS scene/source/stream commands through obs-websocket-style request envelopes after approval.", False, True, ("obs-websocket 5.x protocol",)),
        _cap("ai_to_ai_messages", "AI-to-AI creator messaging", "messaging", CapabilityStatus.PROTOTYPE, SafetyLevel.MEDIUM, ApprovalMode.CONFIRM, "Lets a creator ask Blue to send a message to Qwen or another trusted node through BlueMesh, pending approval.", True),
        _cap("vision_image_understanding", "Vision and image understanding", "vision", CapabilityStatus.PROTOTYPE, SafetyLevel.MEDIUM, ApprovalMode.CONFIRM, "Accepts user-provided images/screenshots/folders for OCR and description; hidden surveillance is blocked.", True),
        _cap("reference_art_generation", "Reference-aware art generation", "creation", CapabilityStatus.PROTOTYPE, SafetyLevel.MEDIUM, ApprovalMode.CONFIRM, "Builds a provenance manifest from many references before generating or requesting art, reducing confusion from overloaded reference packs.", True),
        _cap("live2d_3d_model_pipeline", "3D and Live2D production pipeline", "creation", CapabilityStatus.PLANNED, SafetyLevel.MEDIUM, ApprovalMode.CONFIRM, "Queues VRM, Blender, Live2D, texture, rigging, physics, expression, and export tasks with separate asset manifests.", True, False, ("VRM glTF avatar docs", "Live2D Cubism SDK manual")),
        _cap("web_research_tutor", "Research and teaching mode", "learning", CapabilityStatus.PROTOTYPE, SafetyLevel.MEDIUM, ApprovalMode.CONFIRM, "Turns a topic into sourced research notes, lessons, exercises, checkpoints, and follow-up practice plans.", True),
        _cap("social_post_queue", "Social posting with approval", "social", CapabilityStatus.PROTOTYPE, SafetyLevel.HIGH, ApprovalMode.CREATOR_REQUIRED, "Drafts posts and captions for review; never posts publicly without creator approval.", True, True),
        _cap("schedule_planner", "Schedule planner", "scheduling", CapabilityStatus.PROTOTYPE, SafetyLevel.MEDIUM, ApprovalMode.CONFIRM, "Stores content plans, learning plans, stream prep tasks, project routines, and reminders for Blue to surface later.", True),
        _cap("blue_self_upgrade_plan", "Self-upgrade planning", "research", CapabilityStatus.PROTOTYPE, SafetyLevel.HIGH, ApprovalMode.CREATOR_REQUIRED, "Researches upgrades, creates change plans, syncs through BlueMesh/GitHub, and requires approval before modifying code or memory.", True),
    )
