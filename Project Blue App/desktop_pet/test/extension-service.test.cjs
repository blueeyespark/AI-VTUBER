const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlueExtensionService } = require("../extension-service.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-extension-"));
  const service = new BlueExtensionService(root, {
    moduleRoot: path.resolve(__dirname, ".."),
    extensionsRoot: path.join(root, "extensions"),
    blueVersion: "2.3.0"
  });
  return { root, service, sample: path.resolve(__dirname, "..", "sample-extension") };
}

function writeExtension(root, manifest, source = "module.exports = { activate() {} };") {
  const directory = path.join(root, `source-${manifest.id}-${manifest.version}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "blue-extension.json"), JSON.stringify({ engines: { blue: "2" }, main: "extension.cjs", ...manifest }, null, 2));
  fs.writeFileSync(path.join(directory, "extension.cjs"), source);
  return directory;
}

test("validates manifests and rejects incompatible or unsafe extensions", () => {
  const { service } = fixture();
  assert.equal(service.validateManifest({ id: "sample.safe", version: "1.0.0", engines: { blue: "2" } }).compatible, true);
  assert.throws(() => service.validateManifest({ id: "BAD", version: "1.0.0" }), /safe lowercase id/);
  assert.throws(() => service.validateManifest({ id: "sample.bad", version: "1.0.0", permissions: ["secrets"] }), /Unsupported/);
  assert.equal(service.validateManifest({ id: "sample.future", version: "1.0.0", engines: { blue: "9" } }).compatible, false);
});

test("installs a sample and exposes command, view, editor, language, and settings contributions", () => {
  const { service, sample } = fixture();
  assert.throws(() => service.install(sample), /explicit approval/);
  const installed = service.install(sample, true);
  assert.equal(installed.id, "project-blue.hello-workbench");
  const contributions = service.list().contributions;
  for (const key of ["commands", "views", "editors", "languages", "settings"]) assert.equal(contributions[key].length, 1);
});

test("enforces extension dependencies and supports explicitly approved updates", () => {
  const { root, service } = fixture();
  const dependent = writeExtension(root, { id: "sample.dependent", name: "Dependent", version: "1.0.0", dependencies: { "sample.base": "^1.0.0" } });
  assert.throws(() => service.install(dependent, true), /required extension dependencies/);
  const baseOne = writeExtension(root, { id: "sample.base", name: "Base", version: "1.0.0" });
  service.install(baseOne, true);
  assert.equal(service.install(dependent, true).version, "1.0.0");
  const baseTwo = writeExtension(root, { id: "sample.base", name: "Base", version: "1.1.0" });
  assert.throws(() => service.update(baseTwo), /explicit approval/);
  assert.equal(service.update(baseTwo, true).version, "1.1.0");
  assert.throws(() => service.update(baseTwo, true), /already at/);
});

test("runs an extension command in the isolated host and supports lifecycle controls", async t => {
  const { service, sample } = fixture();
  t.after(() => service.stop());
  service.install(sample, true);
  const result = await service.executeCommand("blue.hello", { name: "Creator" });
  assert.match(result.message, /Creator/);
  assert.equal(service.extension("project-blue.hello-workbench").active, true);
  await service.deactivate("project-blue.hello-workbench");
  assert.equal(service.extension("project-blue.hello-workbench").active, false);
  assert.equal(service.setEnabled("project-blue.hello-workbench", false).enabled, false);
  service.setEnabled("project-blue.hello-workbench", true);
  assert.throws(() => service.uninstall("project-blue.hello-workbench"), /explicit approval/);
  assert.equal(service.uninstall("project-blue.hello-workbench", true).uninstalled, true);
});
