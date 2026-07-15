const assert = require("node:assert/strict");
const test = require("node:test");
const { BlueFeatureService, FEATURE_DEFINITIONS, formatBlueFeatureResult } = require("../blue-feature-service.cjs");

test("catalog keeps every Phase 11 capability in one workbench map", async () => {
  const adapters = Object.fromEntries(Object.keys(FEATURE_DEFINITIONS).map(key => [key, { status: async () => ({ ok: true }) }]));
  const result = await new BlueFeatureService(adapters).catalog();
  assert.equal(result.identity, "one-blue");
  assert.equal(result.features.length, 11);
  assert.ok(result.features.every(item => item.state === "ready" && item.activity && item.editor));
});

test("chat exposes feature catalog and status", async () => {
  const service = new BlueFeatureService({ streaming: { status: async () => ({ obs: "ready" }) } });
  const catalog = await service.handleMessage("/blue features");
  assert.match(formatBlueFeatureResult(catalog), /Streaming Studio: ready/);
  const status = await service.handleMessage("/blue streaming status");
  assert.deepEqual(status.data.data, { obs: "ready" });
});

test("mutating feature actions require explicit approval", async () => {
  const service = new BlueFeatureService({ ideas: { status: async () => ({}), actions: { capture: async value => value } } });
  await assert.rejects(service.execute({ feature: "ideas", action: "capture", value: "new idea" }), /explicit approval/);
  const result = await service.execute({ feature: "ideas", action: "capture", value: "new idea", approved: true });
  assert.equal(result.data, "new idea");
});

test("unknown capabilities and actions fail closed", async () => {
  const service = new BlueFeatureService({ memory: { status: async () => ({}) } });
  await assert.rejects(service.execute({ feature: "treasury" }), /Unknown/);
  await assert.rejects(service.execute({ feature: "memory", action: "erase" }), /does not expose/);
});
