const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeStreamingConfig,
  sanitizeStreamingConfig,
  createObsAuthentication,
  streamingPolicySummary,
  streamingPlatformCatalog,
  streamShowCatalog,
  streamingAutonomyCatalog,
  buildStreamingPlan,
  buildStreamerShowPlan,
  buildStreamerRunOfShow,
  buildStreamingPreflight,
  streamingChatGuide,
  moderateChatMessage,
  adultPlatformReadiness
} = require("../streaming-core.cjs");

test("streaming platform catalog includes SFW, community, adult, and custom targets", () => {
  const catalog = streamingPlatformCatalog();
  const ids = new Set(catalog.map(platform => platform.id));
  assert.ok(ids.has("twitch"));
  assert.ok(ids.has("youtube"));
  assert.ok(ids.has("tiktok_live"));
  assert.ok(ids.has("discord"));
  assert.ok(ids.has("stripchat"));
  assert.ok(ids.has("custom_adult"));
  assert.ok(catalog.some(platform => platform.type === "sfw"));
  assert.ok(catalog.some(platform => platform.type === "adult" && platform.requiresAgeVerification));
  assert.ok(catalog.some(platform => platform.chatSupport === "adapter_required"));
});

test("streaming config keeps known safe fields and defaults unknown values", () => {
  const config = normalizeStreamingConfig({
    obsUrl: "ws://localhost:4455",
    platform: "unknown",
    streamMode: "mature_labeled",
    chatReadMode: "approved_actions",
    avatarBackend: "live2d",
    independentMode: true
  });
  assert.equal(config.obsUrl, "ws://localhost:4455");
  assert.equal(config.platform, "twitch");
  assert.equal(config.streamMode, "mature_labeled");
  assert.equal(config.chatReadMode, "approved_actions");
  assert.equal(config.avatarBackend, "live2d");
  assert.equal(config.independentMode, true);
});

test("streaming config never persists secrets", () => {
  const config = sanitizeStreamingConfig({
    password: "obs-password",
    token: "platform-token",
    streamKey: "stream-key",
    apiKey: "api-key"
  });
  assert.equal(Object.hasOwn(config, "password"), false);
  assert.equal(Object.hasOwn(config, "token"), false);
  assert.equal(Object.hasOwn(config, "streamKey"), false);
  assert.equal(Object.hasOwn(config, "apiKey"), false);
});

test("OBS authentication response is deterministic and does not expose password", () => {
  const auth = createObsAuthentication("secret", "salt", "challenge");
  assert.equal(auth, createObsAuthentication("secret", "salt", "challenge"));
  assert.notEqual(auth.includes("secret"), true);
  assert.match(auth, /^[A-Za-z0-9+/=]+$/);
});

test("streaming plans include approval and platform safety guidance", () => {
  const policy = streamingPolicySummary({ streamMode: "mature_labeled" });
  const plan = buildStreamingPlan("independent", { platform: "youtube" });
  assert.match(policy, /Platform:/);
  assert.match(policy, /Mature-labeled/);
  assert.match(plan, /approval/i);
  assert.match(plan, /going live/i);
});

test("AI streamer catalogs include show formats and autonomy profiles", () => {
  const shows = streamShowCatalog();
  const autonomy = streamingAutonomyCatalog();
  assert.ok(shows.some(show => show.id === "neuro_chat" && show.requiredSystems.includes("persona_memory")));
  assert.ok(shows.some(show => show.id === "creator_lab" && show.requiredSystems.includes("file_context")));
  assert.ok(shows.some(show => show.id === "adult_verified" && show.requiredSystems.includes("adult_readiness")));
  assert.ok(autonomy.some(level => level.id === "producer" && level.approvalRequired.includes("go live")));
  assert.ok(autonomy.some(level => level.id === "independent_guarded" && level.allowed.includes("stand by when unsafe")));
});

test("AI streamer show plan protects adult formats and independent mode", () => {
  const unsafe = buildStreamerShowPlan({
    showFormat: "adult_verified",
    autonomyLevel: "assistant",
    config: { platform: "twitch", streamMode: "sfw" }
  });
  assert.equal(unsafe.readyToPrepare, false);
  assert.ok(unsafe.warnings.some(warning => /adult platform/i.test(warning)));

  const independent = buildStreamerShowPlan({
    showFormat: "neuro_chat",
    autonomyLevel: "assistant",
    config: { platform: "youtube", streamMode: "sfw", independentMode: true }
  });
  assert.equal(independent.readyToPrepare, false);
  assert.ok(independent.warnings.some(warning => /independent_guarded/i.test(warning)));
});

test("AI streamer run-of-show includes segments, approval boundaries, and memory guidance", () => {
  const runOfShow = buildStreamerRunOfShow({
    showFormat: "creator_lab",
    autonomyLevel: "producer",
    config: { platform: "youtube", streamMode: "sfw" }
  });
  assert.match(runOfShow, /Creator Lab/);
  assert.match(runOfShow, /work session/i);
  assert.match(runOfShow, /Approval-required actions/);
  assert.match(runOfShow, /Save memories only/i);
});

test("streaming preflight blocks go-live while allowing safe preparation", () => {
  const preflight = buildStreamingPreflight({
    platform: "twitch",
    streamMode: "sfw",
    chatReadMode: "read_only",
    independentMode: true
  });
  assert.equal(preflight.readyToPrepare, true);
  assert.equal(preflight.readyToGoLive, false);
  assert.ok(preflight.blockers.includes("go_live"));
  assert.ok(preflight.checks.some(check => check.id === "secrets" && check.status === "ready"));
});

test("streaming chat guide is platform-specific and token-safe", () => {
  const guide = streamingChatGuide({ platform: "youtube", chatReadMode: "moderated_reply" });
  assert.match(guide, /YouTube LiveChatMessages/);
  assert.match(guide, /session-only/);
  assert.match(guide, /draft replies/);
});

test("chat moderation blocks unsafe text and respects read-only mode", () => {
  const blocked = moderateChatMessage("drop their phone number in chat", { platform: "twitch", chatReadMode: "approved_actions" });
  assert.equal(blocked.action, "block");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.reasons.includes("private personal information"));

  const readOnly = moderateChatMessage("hello chat", { platform: "twitch", chatReadMode: "read_only" });
  assert.equal(readOnly.action, "read_only");
  assert.equal(readOnly.allowed, false);
});

test("adult platforms require verified adults, rules review, and approval", () => {
  const blocked = adultPlatformReadiness({
    platform: "chaturbate",
    streamMode: "adult_verified"
  });
  assert.equal(blocked.adultPlatform, true);
  assert.equal(blocked.readyForAdultPreparation, false);
  assert.ok(blocked.blockers.includes("verified_adults_only"));
  assert.ok(blocked.blockers.includes("platform_rules_reviewed"));
  assert.ok(blocked.blockers.includes("adult_content_approval"));

  const ready = adultPlatformReadiness({
    platform: "stripchat",
    streamMode: "adult_verified",
    verifiedAdultsOnly: true,
    platformRulesReviewed: true,
    adultContentApproval: true
  });
  assert.equal(ready.readyForAdultPreparation, true);
  assert.equal(ready.readyToGoLive, false);
});

test("adult verified mode is blocked on SFW platforms", () => {
  const readiness = adultPlatformReadiness({
    platform: "tiktok_live",
    streamMode: "adult_verified",
    verifiedAdultsOnly: true,
    platformRulesReviewed: true,
    adultContentApproval: true
  });
  assert.equal(readiness.adultPlatform, false);
  assert.ok(readiness.blockers.includes("adult_platform_selected"));
  assert.ok(readiness.blockers.includes("no_adult_on_sfw"));
});
