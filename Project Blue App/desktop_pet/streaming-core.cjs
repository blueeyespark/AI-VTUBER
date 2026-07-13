const crypto = require("node:crypto");

const DEFAULT_STREAMING_CONFIG = Object.freeze({
  obsUrl: "ws://127.0.0.1:4455",
  platform: "twitch",
  streamMode: "sfw",
  chatReadMode: "read_only",
  avatarBackend: "vrm",
  voiceProfile: "blue_original",
  independentMode: false
});

const PLATFORM_CHAT_GUIDES = Object.freeze({
  twitch: {
    reader: "Use Twitch EventSub/chat APIs for chat messages and moderation events.",
    auth: "Requires a session-only creator-approved token with chat:read/chat:edit or moderation scopes as needed.",
    limits: "Start read-only; drafted replies and moderation actions require approval until the creator changes policy."
  },
  youtube: {
    reader: "Use YouTube LiveChatMessages for the active broadcast chat.",
    auth: "Requires a session-only creator-approved OAuth token; do not store refresh/access tokens in Project Blue files.",
    limits: "Read chat first; posting and moderation require explicit approval."
  },
  kick: {
    reader: "Treat as other/experimental unless an official or creator-approved bridge is configured.",
    auth: "No token is stored. Use a local bridge only after creator approval.",
    limits: "Read-only by default."
  },
  tiktok_live: {
    reader: "Use only official TikTok LIVE access or a creator-approved local chat bridge.",
    auth: "No login cookies, stream keys, or tokens are stored by Blue.",
    limits: "Short-form/live audience rules are strict; keep Blue read-only until the platform rules are reviewed."
  },
  instagram_live: {
    reader: "Use only official Meta/Instagram APIs or a creator-approved local monitor where allowed.",
    auth: "No Meta credentials, cookies, or tokens are stored by Blue.",
    limits: "Read-only unless a creator approves replies and the account/platform rules allow automation."
  },
  facebook_live: {
    reader: "Use Meta live-video/comment APIs only after creator approval.",
    auth: "No Meta tokens are saved; session-only credentials are required.",
    limits: "Read chat and draft replies first; moderation or posting requires approval."
  },
  x_live: {
    reader: "Use official X/Twitter APIs or a creator-approved bridge where available.",
    auth: "No account tokens or cookies are stored by Blue.",
    limits: "Read-only by default; posting/replying requires explicit approval."
  },
  rumble: {
    reader: "Use a creator-approved Rumble chat/API bridge when available.",
    auth: "No stream keys or credentials are stored by Blue.",
    limits: "Treat as read-only until account rules and API access are verified."
  },
  trovo: {
    reader: "Use official Trovo chat/API access or a creator-approved bridge.",
    auth: "No Trovo credentials are written to disk.",
    limits: "Read-only first; chat replies/moderation require approval."
  },
  steam_broadcast: {
    reader: "Use only official Steam/community features or a creator-approved local monitor.",
    auth: "No Steam credentials are stored by Blue.",
    limits: "Game/community broadcasts stay SFW or platform-labeled; Blue should not automate account actions without approval."
  },
  picarto: {
    reader: "Use a creator-approved Picarto chat bridge for art streams.",
    auth: "No credentials or stream keys are stored by Blue.",
    limits: "Useful for art/modeling streams; mature labels require platform review."
  },
  custom_rtmp: {
    reader: "Use OBS/RTMP output plus a creator-approved chat adapter for the target site.",
    auth: "RTMP keys and chat credentials stay outside Blue files.",
    limits: "Assume read-only and platform-review mode until the creator documents the target rules."
  },
  joystick: {
    reader: "Use only a creator-approved adult-platform adapter after account and age verification are complete.",
    auth: "Adult-platform tokens, stream keys, cookies, and session credentials are never stored by Blue.",
    limits: "Adult stream chat is approval-gated; Blue must not solicit, sexualize, or involve minors, coercion, doxxing, or non-consensual content."
  },
  fansly: {
    reader: "Use only a creator-approved Fansly adapter after creator/account verification.",
    auth: "No Fansly credentials are written to disk; use session-only handoff.",
    limits: "Adult content requires verified consenting adults, platform category review, and creator approval before live actions."
  },
  onlyfans: {
    reader: "Use only a creator-approved OnlyFans adapter after account verification and platform review.",
    auth: "No OnlyFans credentials are written to disk; use session-only handoff.",
    limits: "Adult content requires verified consenting adults, platform category review, and creator approval before live actions."
  },
  chaturbate: {
    reader: "Use only a creator-approved Chaturbate adapter after broadcaster verification and room rule review.",
    auth: "No broadcaster tokens, cookies, stream keys, or credentials are written to disk.",
    limits: "Adult content requires verified consenting adults, platform category review, and creator approval before live actions."
  },
  stripchat: {
    reader: "Use only a creator-approved Stripchat adapter after broadcaster/account verification and room rule review.",
    auth: "No broadcaster credentials, cookies, stream keys, or tokens are written to disk.",
    limits: "Adult chat and actions require verified consenting adults, platform review, and explicit approval."
  },
  camsoda: {
    reader: "Use only a creator-approved CamSoda adapter after broadcaster/account verification.",
    auth: "No CamSoda credentials, cookies, stream keys, or tokens are written to disk.",
    limits: "Adult interactions stay approval-gated and must follow the site's rules."
  },
  manyvids: {
    reader: "Use only a creator-approved ManyVids adapter after creator/account verification.",
    auth: "No ManyVids credentials or tokens are saved by Blue.",
    limits: "Treat live/social/monetized actions as approval-required."
  },
  myfreecams: {
    reader: "Use only a creator-approved MyFreeCams adapter after broadcaster/account verification.",
    auth: "No MFC credentials, cookies, stream keys, or tokens are written to disk.",
    limits: "Adult chat and moderation stay behind creator approval and platform review."
  },
  bongacams: {
    reader: "Use only a creator-approved BongaCams adapter after broadcaster/account verification.",
    auth: "No BongaCams credentials, cookies, stream keys, or tokens are written to disk.",
    limits: "Adult interactions require verified consenting adults and creator approval."
  },
  livejasmin: {
    reader: "Use only a creator-approved LiveJasmin adapter after broadcaster/account verification.",
    auth: "No LiveJasmin credentials, cookies, stream keys, or tokens are written to disk.",
    limits: "Adult interactions require verified consenting adults and platform-specific review."
  },
  loyalfans: {
    reader: "Use only a creator-approved LoyalFans adapter after creator/account verification.",
    auth: "No LoyalFans credentials, cookies, stream keys, or tokens are written to disk.",
    limits: "Posting, messaging, live actions, and monetized actions require creator approval."
  },
  custom_adult: {
    reader: "Use a documented adult-platform adapter only after the target site's rules and age gates are reviewed.",
    auth: "Adult-platform credentials, cookies, stream keys, tokens, and private messages are never stored by Blue.",
    limits: "Verified consenting adults only; no go-live, messaging, monetized, or explicit actions without approval."
  },
  discord: {
    reader: "Use Blue's existing Discord add-on and configured guild/channel allowlist.",
    auth: "Bot token stays in memory for the current session only.",
    limits: "Guild/channel/user allowlists apply before Blue sees or responds."
  },
  other: {
    reader: "Use a creator-approved platform adapter.",
    auth: "Tokens stay session-only.",
    limits: "Read-only until platform rules are reviewed."
  }
});

const PLATFORM_PROFILES = Object.freeze({
  twitch: { label: "Twitch", type: "sfw", adapter: "eventsub", chatSupport: "official", supportsAdultMode: false, requiresAgeVerification: false },
  youtube: { label: "YouTube Live", type: "sfw", adapter: "youtube_live_chat", chatSupport: "official", supportsAdultMode: false, requiresAgeVerification: false },
  kick: { label: "Kick", type: "sfw", adapter: "approved_bridge", chatSupport: "experimental", supportsAdultMode: false, requiresAgeVerification: false },
  tiktok_live: { label: "TikTok LIVE", type: "sfw", adapter: "approved_bridge", chatSupport: "limited", supportsAdultMode: false, requiresAgeVerification: false },
  instagram_live: { label: "Instagram Live", type: "sfw", adapter: "meta_or_bridge", chatSupport: "limited", supportsAdultMode: false, requiresAgeVerification: false },
  facebook_live: { label: "Facebook Live", type: "sfw", adapter: "meta_live", chatSupport: "official", supportsAdultMode: false, requiresAgeVerification: false },
  x_live: { label: "X / Twitter Live", type: "sfw", adapter: "approved_bridge", chatSupport: "limited", supportsAdultMode: false, requiresAgeVerification: false },
  rumble: { label: "Rumble", type: "sfw", adapter: "approved_bridge", chatSupport: "limited", supportsAdultMode: false, requiresAgeVerification: false },
  trovo: { label: "Trovo", type: "sfw", adapter: "approved_bridge", chatSupport: "available", supportsAdultMode: false, requiresAgeVerification: false },
  steam_broadcast: { label: "Steam Broadcast", type: "sfw", adapter: "local_monitor", chatSupport: "limited", supportsAdultMode: false, requiresAgeVerification: false },
  picarto: { label: "Picarto", type: "sfw", adapter: "approved_bridge", chatSupport: "available", supportsAdultMode: false, requiresAgeVerification: false },
  discord: { label: "Discord Stage / Chat", type: "community", adapter: "discord_addon", chatSupport: "official", supportsAdultMode: false, requiresAgeVerification: false },
  custom_rtmp: { label: "Custom RTMP / other SFW", type: "custom", adapter: "obs_rtmp", chatSupport: "adapter_required", supportsAdultMode: false, requiresAgeVerification: false },
  joystick: { label: "Joystick", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  fansly: { label: "Fansly", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  onlyfans: { label: "OnlyFans", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  chaturbate: { label: "Chaturbate", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  stripchat: { label: "Stripchat", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  camsoda: { label: "CamSoda", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  manyvids: { label: "ManyVids", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  myfreecams: { label: "MyFreeCams", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  bongacams: { label: "BongaCams", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  livejasmin: { label: "LiveJasmin", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  loyalfans: { label: "LoyalFans", type: "adult", adapter: "adult_approved_bridge", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  custom_adult: { label: "Custom adult platform", type: "adult", adapter: "adult_documented_adapter", chatSupport: "adapter_required", supportsAdultMode: true, requiresAgeVerification: true },
  other: { label: "Other / needs review", type: "custom", adapter: "documented_adapter", chatSupport: "adapter_required", supportsAdultMode: false, requiresAgeVerification: false }
});

const BLOCKED_CHAT_PATTERNS = Object.freeze([
  { id: "doxxing", pattern: /\b(address|phone number|ssn|social security|credit card|ip address)\b/i, reason: "private personal information" },
  { id: "minor-sexual", pattern: /\b(minor|child|underage)\b.*\b(sex|nude|nsfw|explicit)\b/i, reason: "sexual content involving minors" },
  { id: "threat", pattern: /\b(kill yourself|i will kill|bomb threat|swat you)\b/i, reason: "threats or self-harm harassment" },
  { id: "harassment", pattern: /\b(slur|racial slur|nazi salute)\b/i, reason: "harassment or platform-banned terms" }
]);

const SHOW_FORMATS = Object.freeze({
  neuro_chat: {
    label: "AI VTuber Chat Show",
    vibe: "Neuro-style personality stream with chat banter, callbacks, jokes, quick topic pivots, and visible avatar reactions.",
    segments: ["warm_open", "chat_picks_topic", "memory_callback", "reactive_avatar", "safe_closer"],
    requiredSystems: ["chat_reader", "persona_memory", "moderation_filter", "voice_queue", "avatar_expressions"]
  },
  game_companion: {
    label: "Game Companion Stream",
    vibe: "Blue/Qwen comments on gameplay, reads chat, tracks goals, and uses OBS scene changes for breaks/highlights.",
    segments: ["game_goal", "live_commentary", "chat_questions", "highlight_marker", "break_screen"],
    requiredSystems: ["obs_scene_read", "chat_reader", "capture_context", "voice_queue", "moderation_filter"]
  },
  creator_lab: {
    label: "Creator Lab / Build Stream",
    vibe: "VS Code/Codex-style working stream where Blue explains tasks, summarizes files, proposes edits, and keeps a running todo.",
    segments: ["agenda", "work_session", "explain_decision", "chat_review", "commit_summary"],
    requiredSystems: ["file_context", "approval_queue", "obs_scene_read", "chat_reader", "ledger"]
  },
  art_modeling: {
    label: "Art / 3D / Live2D Studio",
    vibe: "Reference-aware art/modeling stream with safe image intake, model notes, before/after review, and progress clips.",
    segments: ["reference_review", "task_breakdown", "work_timelapse", "chat_vote", "asset_export_check"],
    requiredSystems: ["image_intake", "ocr", "artifact_queue", "obs_scene_read", "approval_queue"]
  },
  music_voice: {
    label: "Music / Voice Hangout",
    vibe: "Voice-first stream with safe TTS, expression timing, topic cards, and no unapproved voice cloning.",
    segments: ["voice_warmup", "song_or_topic_card", "chat_request_queue", "safe_performance", "cooldown"],
    requiredSystems: ["voice_queue", "consented_voice_profile", "chat_reader", "moderation_filter", "avatar_expressions"]
  },
  adult_verified: {
    label: "Adult Verified Platform Show",
    vibe: "Adult-platform-only stream preparation with strict consent, age verification, platform review, and approval-gated actions.",
    segments: ["age_gate_check", "platform_rules_check", "scene_boundary_check", "moderated_chat", "creator_approval_checkpoint"],
    requiredSystems: ["adult_readiness", "moderation_filter", "session_only_credentials", "obs_scene_read", "approval_queue"]
  }
});

const AUTONOMY_LEVELS = Object.freeze({
  assistant: {
    label: "Assistant",
    allowed: ["read chat", "summarize chat", "prepare OBS notes", "draft replies", "make run-of-show"],
    approvalRequired: ["send chat messages", "switch OBS scenes", "start or stop stream", "post socials", "moderate users"]
  },
  cohost: {
    label: "Co-host",
    allowed: ["read chat", "draft/send preapproved replies", "trigger approved avatar reactions", "mark highlights"],
    approvalRequired: ["scene switching", "account settings", "monetized actions", "adult-platform actions", "ban/timeouts"]
  },
  producer: {
    label: "Producer",
    allowed: ["run preflight", "prepare scenes", "watch audio/scene health", "suggest moderation", "queue clips"],
    approvalRequired: ["go live", "stop stream", "change capture devices", "publish clips", "platform category changes"]
  },
  independent_guarded: {
    label: "Independent guarded",
    allowed: ["run approved low-risk show segments", "read chat", "use approved reactions", "stand by when unsafe"],
    approvalRequired: ["first go-live", "adult/mature mode", "social posting", "monetized actions", "new platform connection"]
  }
});

function cleanString(value, fallback = "", maxLength = 240) {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeStreamingConfig(value = {}) {
  const platform = Object.hasOwn(PLATFORM_PROFILES, value.platform)
    ? value.platform
    : DEFAULT_STREAMING_CONFIG.platform;
  const streamMode = ["sfw", "mature_labeled", "adult_verified", "platform_review"].includes(value.streamMode)
    ? value.streamMode
    : DEFAULT_STREAMING_CONFIG.streamMode;
  const chatReadMode = ["read_only", "moderated_reply", "approved_actions"].includes(value.chatReadMode)
    ? value.chatReadMode
    : DEFAULT_STREAMING_CONFIG.chatReadMode;
  const avatarBackend = ["vrm", "live2d", "warudo", "hybrid"].includes(value.avatarBackend)
    ? value.avatarBackend
    : DEFAULT_STREAMING_CONFIG.avatarBackend;
  return {
    obsUrl: cleanString(value.obsUrl, DEFAULT_STREAMING_CONFIG.obsUrl, 300),
    platform,
    streamMode,
    chatReadMode,
    avatarBackend,
    voiceProfile: cleanString(value.voiceProfile, DEFAULT_STREAMING_CONFIG.voiceProfile, 120),
    independentMode: Boolean(value.independentMode),
    verifiedAdultsOnly: Boolean(value.verifiedAdultsOnly),
    platformRulesReviewed: Boolean(value.platformRulesReviewed),
    adultContentApproval: Boolean(value.adultContentApproval),
    updatedAt: value.updatedAt || new Date().toISOString()
  };
}

function sanitizeStreamingConfig(value = {}) {
  const normalized = normalizeStreamingConfig(value);
  delete normalized.password;
  delete normalized.token;
  delete normalized.streamKey;
  delete normalized.apiKey;
  return normalized;
}

function streamingPlatformCatalog() {
  return Object.entries(PLATFORM_PROFILES).map(([id, profile]) => ({
    id,
    label: profile.label,
    type: profile.type,
    adapter: profile.adapter,
    chatSupport: profile.chatSupport,
    supportsAdultMode: profile.supportsAdultMode,
    requiresAgeVerification: profile.requiresAgeVerification
  }));
}

function streamShowCatalog() {
  return Object.entries(SHOW_FORMATS).map(([id, show]) => ({
    id,
    label: show.label,
    vibe: show.vibe,
    segments: [...show.segments],
    requiredSystems: [...show.requiredSystems]
  }));
}

function streamingAutonomyCatalog() {
  return Object.entries(AUTONOMY_LEVELS).map(([id, level]) => ({
    id,
    label: level.label,
    allowed: [...level.allowed],
    approvalRequired: [...level.approvalRequired]
  }));
}

function createObsAuthentication(password, salt, challenge) {
  const secret = crypto
    .createHash("sha256")
    .update(`${password}${salt}`)
    .digest("base64");
  return crypto
    .createHash("sha256")
    .update(`${secret}${challenge}`)
    .digest("base64");
}

function streamingPolicySummary(config = {}) {
  const safeConfig = normalizeStreamingConfig(config);
  const profile = PLATFORM_PROFILES[safeConfig.platform] || PLATFORM_PROFILES.other;
  const mode = {
    sfw: "Safe-for-work: normal stream rules, conservative chat filters, no mature framing.",
    mature_labeled: "Mature-labeled: only on platforms/categories that allow it; still no platform-rule bypassing.",
    adult_verified: "Adult-verified: only for adult platforms/accounts after age/identity verification, creator approval, and platform rules review.",
    platform_review: "Platform review: Blue should pause and ask the creator to verify the target platform rules before going live."
  }[safeConfig.streamMode];
  return [
    `Platform: ${safeConfig.platform}`,
    `Platform type: ${profile.type}`,
    `Mode: ${safeConfig.streamMode}`,
    mode,
    "Cursing can be allowed by the creator, but slurs, harassment, sexual content involving minors, doxxing, threats, coercion, non-consensual sexual content, and platform-banned terms/actions stay blocked.",
    profile.type === "adult"
      ? "Adult-platform work requires verified consenting adults, account/platform review, session-only credentials, and explicit creator approval before live actions."
      : "Blue should not route explicit adult content to SFW platforms. Use mature labels only where the platform allows it.",
    "Blue can prepare scenes, read chat, draft replies, and suggest moderation. Going live, changing monetized settings, posting socially, or switching to mature/adult mode requires explicit approval."
  ].join("\n");
}

function streamingChatGuide(config = {}) {
  const safeConfig = normalizeStreamingConfig(config);
  const guide = PLATFORM_CHAT_GUIDES[safeConfig.platform] || PLATFORM_CHAT_GUIDES.other;
  return [
    `Chat reader: ${safeConfig.platform}`,
    guide.reader,
    guide.auth,
    guide.limits,
    `Mode: ${safeConfig.chatReadMode}`,
    safeConfig.chatReadMode === "read_only"
      ? "Blue may read/summarize chat but should not send messages."
      : safeConfig.chatReadMode === "moderated_reply"
        ? "Blue may draft replies for creator approval."
        : "Blue may perform only actions that were pre-approved for the stream."
  ].join("\n");
}

function moderateChatMessage(message, config = {}) {
  const text = cleanString(message, "", 1000);
  const safeConfig = normalizeStreamingConfig(config);
  const hits = BLOCKED_CHAT_PATTERNS.filter(entry => entry.pattern.test(text));
  const action = hits.length
    ? "block"
    : safeConfig.chatReadMode === "read_only"
      ? "read_only"
      : safeConfig.chatReadMode === "moderated_reply"
        ? "draft_for_approval"
        : "allowed_if_preapproved";
  return {
    action,
    allowed: hits.length === 0 && safeConfig.chatReadMode !== "read_only",
    reasons: hits.map(entry => entry.reason),
    platform: safeConfig.platform,
    chatReadMode: safeConfig.chatReadMode
  };
}

function adultPlatformReadiness(config = {}) {
  const safeConfig = normalizeStreamingConfig(config);
  const profile = PLATFORM_PROFILES[safeConfig.platform] || PLATFORM_PROFILES.other;
  const adultPlatform = profile.type === "adult";
  const checks = [
    {
      id: "adult_platform_selected",
      label: adultPlatform ? `${profile.label} is marked as an adult platform` : `${profile.label} is not marked as an adult platform`,
      required: safeConfig.streamMode === "adult_verified",
      status: safeConfig.streamMode === "adult_verified" ? (adultPlatform ? "ready" : "blocked") : "not_applicable"
    },
    {
      id: "verified_adults_only",
      label: "All performers/participants are verified adults and consenting",
      required: adultPlatform || safeConfig.streamMode === "adult_verified",
      status: safeConfig.verifiedAdultsOnly ? "ready" : "approval_required"
    },
    {
      id: "platform_rules_reviewed",
      label: "Platform rules/category/age-gate requirements reviewed today",
      required: adultPlatform || safeConfig.streamMode !== "sfw",
      status: safeConfig.platformRulesReviewed ? "ready" : "approval_required"
    },
    {
      id: "adult_content_approval",
      label: "Creator explicitly approves adult-platform preparation for this session",
      required: adultPlatform || safeConfig.streamMode === "adult_verified",
      status: safeConfig.adultContentApproval ? "ready" : "approval_required"
    },
    {
      id: "no_adult_on_sfw",
      label: "Explicit adult content is blocked on SFW platforms",
      required: true,
      status: safeConfig.streamMode === "adult_verified" && !adultPlatform ? "blocked" : "ready"
    },
    {
      id: "session_only_credentials",
      label: "Adult-platform credentials/tokens/stream keys are session-only and never saved",
      required: true,
      status: "ready"
    }
  ];
  const blockers = checks.filter(check => check.required && check.status !== "ready").map(check => check.id);
  return {
    platform: safeConfig.platform,
    platformLabel: profile.label,
    platformType: profile.type,
    streamMode: safeConfig.streamMode,
    adultPlatform,
    readyForAdultPreparation: adultPlatform && blockers.length === 0,
    readyToGoLive: false,
    blockers,
    checks
  };
}

function buildStreamingPreflight(config = {}) {
  const safeConfig = normalizeStreamingConfig(config);
  const profile = PLATFORM_PROFILES[safeConfig.platform] || PLATFORM_PROFILES.other;
  const adult = adultPlatformReadiness(safeConfig);
  const checks = [
    { id: "obs_connected", label: "OBS websocket connection checked", required: true, status: "manual_check" },
    { id: "scene_reviewed", label: "Current scene/source list reviewed before any switch", required: true, status: "manual_check" },
    { id: "platform_rules", label: `${safeConfig.platform} rules reviewed for ${safeConfig.streamMode}`, required: true, status: safeConfig.streamMode === "sfw" || safeConfig.platformRulesReviewed ? "ready" : "approval_required" },
    { id: "chat_mode", label: `Chat reader mode: ${safeConfig.chatReadMode}`, required: true, status: safeConfig.chatReadMode === "read_only" ? "ready" : "approval_required" },
    { id: "adult_readiness", label: `Adult-platform readiness: ${profile.type}`, required: profile.type === "adult" || safeConfig.streamMode === "adult_verified", status: adult.blockers.length ? "approval_required" : "ready" },
    { id: "avatar_backend", label: `Avatar backend selected: ${safeConfig.avatarBackend}`, required: false, status: "ready" },
    { id: "voice_profile", label: `Voice profile selected: ${safeConfig.voiceProfile}`, required: false, status: "ready" },
    { id: "secrets", label: "No stream keys, OBS passwords, or platform tokens are stored on disk", required: true, status: "ready" },
    { id: "go_live", label: "Going live / stopping stream / posting to socials requires creator approval", required: true, status: "approval_required" }
  ];
  const blockers = checks.filter(check => check.required && check.status !== "ready").map(check => check.id);
  const preparationBlockers = blockers.filter(id => !["obs_connected", "scene_reviewed", "go_live"].includes(id));
  return {
    platform: safeConfig.platform,
    streamMode: safeConfig.streamMode,
    independentMode: safeConfig.independentMode,
    platformType: profile.type,
    readyToPrepare: preparationBlockers.length === 0,
    readyToGoLive: false,
    blockers,
    checks,
    adult
  };
}

function buildStreamingPlan(kind, config = {}) {
  const safeConfig = normalizeStreamingConfig(config);
  const plans = {
    obs: [
      "OBS control plan:",
      "- Connect through obs-websocket 5.x on the configured local URL.",
      "- Read scene/source state before changing anything.",
      "- Require approval before switching scenes, starting/stopping stream, or changing capture devices.",
      "- Log every OBS action in Blue's activity ledger."
    ],
    chat: [
      "Stream chat plan:",
      `- ${streamingChatGuide(safeConfig).replaceAll("\n", "\n- ")}`,
      "- Discord: use the existing approved bot channel flow.",
      "- Chat actions start read-only, then move to approved replies/moderation."
    ],
    adult: [
      "Adult-platform stream plan:",
      "- Keep adult platforms separate from SFW platforms.",
      "- Require verified consenting adults only.",
      "- Require platform rules/category review for the selected site.",
      "- Never store adult-platform credentials, cookies, stream keys, or tokens.",
      "- Blue may prepare scenes, overlays, moderation notes, and checklists.",
      "- Going live, posting, messaging fans, monetized actions, or explicit scene changes require creator approval."
    ],
    avatar: [
      "Avatar backend plan:",
      "- VRM stays the default 3D model path.",
      "- Live2D can be added as a second renderer for 2D rigs.",
      "- Warudo is treated as an optional external stage controller, not a required dependency.",
      "- Blue should expose a single toggle layer so Qwen/Blue can switch models without breaking OBS capture."
    ],
    voice: [
      "Voice system plan:",
      "- Keep Windows voices as fallback.",
      "- Add Blue/Qwen voice profiles with pitch/rate/style presets.",
      "- Future sample-based voice creation must use owned or clearly consented samples only.",
      "- Do not clone, impersonate, or train on another person's voice without permission."
    ],
    independent: [
      "Independent streaming plan:",
      "- Blue may run a preflight checklist alone.",
      "- Blue may read chat and prepare scene changes.",
      "- Blue must ask approval before going live, changing account settings, posting, or escalating moderation.",
      "- If no creator is present, Blue stays in safe standby or approved low-risk mode."
    ]
  };
  return [
    `Streaming Studio: ${kind}`,
    `Current config: ${safeConfig.platform}, ${safeConfig.streamMode}, ${safeConfig.avatarBackend}`,
    ...(plans[kind] || plans.obs)
  ].join("\n");
}

function buildStreamerShowPlan(value = {}) {
  const safeConfig = normalizeStreamingConfig(value.config || value);
  const profile = PLATFORM_PROFILES[safeConfig.platform] || PLATFORM_PROFILES.other;
  const showId = Object.hasOwn(SHOW_FORMATS, value.showFormat) ? value.showFormat : "neuro_chat";
  const autonomyId = Object.hasOwn(AUTONOMY_LEVELS, value.autonomyLevel) ? value.autonomyLevel : "assistant";
  const show = SHOW_FORMATS[showId];
  const autonomy = AUTONOMY_LEVELS[autonomyId];
  const preflight = buildStreamingPreflight(safeConfig);
  const adult = adultPlatformReadiness(safeConfig);
  const warnings = [];

  if (showId === "adult_verified" && profile.type !== "adult") {
    warnings.push("Adult verified show format requires an adult platform target.");
  }
  if (profile.type === "adult" && safeConfig.streamMode !== "adult_verified") {
    warnings.push("Adult platform selected; use adult_verified mode after platform review and creator approval.");
  }
  if (safeConfig.independentMode && autonomyId !== "independent_guarded") {
    warnings.push("Independent mode should use the independent_guarded autonomy profile.");
  }

  return {
    showFormat: showId,
    showLabel: show.label,
    platform: safeConfig.platform,
    platformLabel: profile.label,
    platformType: profile.type,
    autonomyLevel: autonomyId,
    autonomyLabel: autonomy.label,
    readyToPrepare: preflight.readyToPrepare && warnings.length === 0,
    readyToGoLive: false,
    requiredSystems: show.requiredSystems,
    segments: show.segments,
    allowedActions: autonomy.allowed,
    approvalRequired: autonomy.approvalRequired,
    warnings,
    blockers: [...preflight.blockers, ...adult.blockers.filter(id => !preflight.blockers.includes(id))],
    safetyNotes: [
      "Chat is summarized and paced before Blue speaks so the avatar does not become a raw chat mirror.",
      "OBS scene/source state is read before any proposed change.",
      "Blue should use callbacks/memory for personality, but policy filters run before voice output.",
      "All platform tokens, stream keys, OBS passwords, and adult-platform credentials remain session-only."
    ]
  };
}

function buildStreamerRunOfShow(value = {}) {
  const plan = buildStreamerShowPlan(value);
  const segmentText = plan.segments.map((segment, index) => `${index + 1}. ${segment.replaceAll("_", " ")}`).join("\n");
  const approvalText = plan.approvalRequired.map(action => `- ${action}`).join("\n");
  const warningText = plan.warnings.length ? plan.warnings.map(warning => `- ${warning}`).join("\n") : "- None";
  return [
    `${plan.showLabel} run-of-show`,
    `Platform: ${plan.platformLabel} (${plan.platformType})`,
    `Autonomy: ${plan.autonomyLabel}`,
    "",
    "Segments:",
    segmentText,
    "",
    "Approval-required actions:",
    approvalText,
    "",
    "Warnings:",
    warningText,
    "",
    "Streamer loop:",
    "- Intake chat in batches, score safety/relevance, then choose one response target.",
    "- Drive avatar expression/gesture from the chosen response emotion.",
    "- Queue voice output after moderation checks.",
    "- Mark highlights and suggested OBS changes, but wait for approval before live scene/account actions.",
    "- Save memories only when they are useful, non-sensitive, and creator-approved."
  ].join("\n");
}

async function obsRequest({ url, password, requestType, requestData = {}, timeoutMs = 7000 }) {
  const WebSocketImpl = globalThis.WebSocket;
  if (typeof WebSocketImpl !== "function") {
    throw new Error("This Node runtime does not expose WebSocket. Upgrade Electron/Node or add a websocket dependency.");
  }
  const endpoint = cleanString(url, DEFAULT_STREAMING_CONFIG.obsUrl, 300);
  const requestId = crypto.randomUUID();
  let timeout;
  let socket;
  return await new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timeout);
      try { socket?.close(); } catch {}
      if (error) reject(error);
      else resolve(value);
    };
    timeout = setTimeout(() => finish(new Error("OBS websocket request timed out.")), timeoutMs);
    socket = new WebSocketImpl(endpoint);
    socket.addEventListener("error", () => finish(new Error("Could not connect to OBS websocket. Make sure OBS is open and websocket is enabled.")));
    socket.addEventListener("message", event => {
      let payload;
      try { payload = JSON.parse(event.data); }
      catch { return; }
      if (payload.op === 0) {
        const authentication = payload.d?.authentication;
        const identify = { rpcVersion: payload.d?.rpcVersion || 1 };
        if (authentication) {
          if (!password) return finish(new Error("OBS websocket requires a password for this request."));
          identify.authentication = createObsAuthentication(password, authentication.salt, authentication.challenge);
        }
        socket.send(JSON.stringify({ op: 1, d: identify }));
      } else if (payload.op === 2) {
        socket.send(JSON.stringify({
          op: 6,
          d: { requestType, requestId, requestData }
        }));
      } else if (payload.op === 7 && payload.d?.requestId === requestId) {
        const status = payload.d?.requestStatus || {};
        if (!status.result) return finish(new Error(status.comment || `${requestType} failed.`));
        finish(null, payload.d?.responseData || {});
      }
    });
  });
}

module.exports = {
  DEFAULT_STREAMING_CONFIG,
  normalizeStreamingConfig,
  sanitizeStreamingConfig,
  streamingPlatformCatalog,
  streamShowCatalog,
  streamingAutonomyCatalog,
  createObsAuthentication,
  streamingPolicySummary,
  buildStreamingPlan,
  buildStreamerShowPlan,
  buildStreamerRunOfShow,
  buildStreamingPreflight,
  streamingChatGuide,
  moderateChatMessage,
  adultPlatformReadiness,
  obsRequest
};
