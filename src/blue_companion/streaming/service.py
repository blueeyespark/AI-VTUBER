"""Streaming brain plans for Twitch/Discord/OBS driven Blue."""
from __future__ import annotations
from ..model import ApprovalMode, CompanionActionPlan, SafetyLevel

class StreamBrainPlanner:
    def chat_response_plan(self, platform: str, response_mode: str = "mention") -> CompanionActionPlan:
        if response_mode not in {"mention", "all", "manual"}:
            raise ValueError("response_mode must be mention, all, or manual")
        return CompanionActionPlan("stream_chat_response_loop", f"Blue stream chat loop for {platform}", "streaming", ("Receive authorized chat events from Twitch EventSub, Discord gateway, or a local approved relay.", "Score messages for safety, relevance, spam, and creator instructions.", "Let Blue draft an answer, emote, facial expression, and optional OBS cue.", "Send automatically only for approved low-risk modes; otherwise queue for creator approval."), ApprovalMode.CREATOR_REQUIRED, SafetyLevel.HIGH, {"platform": platform, "response_mode": response_mode})
    def neuro_style_stream_plan(self) -> CompanionActionPlan:
        return CompanionActionPlan("neuro_style_live_show_loop", "Always-on AI VTuber stream loop", "streaming", ("Perception: ingest chat, OBS state, approved screenshots, microphone transcript, and game/app context.", "Reasoning: maintain stream goals, persona, safety boundaries, memory, and topic queue.", "Performance: choose voice line, expression, gesture, movement state, and OBS action.", "Governance: require creator override for risky actions, social posts, purchases, moderation, and PC control.", "Memory: summarize stream events into BlueMesh/BlueLedger after the stream."), ApprovalMode.CREATOR_REQUIRED, SafetyLevel.HIGH, {"mode": "prototype_architecture"})
