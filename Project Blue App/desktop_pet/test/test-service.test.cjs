const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlueTestService } = require("../test-service.cjs");

test("discovers Node and Python tests as first-class test objects", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-tests-discovery-"));
  try {
    fs.writeFileSync(path.join(root, "blue.test.cjs"), "const test=require('node:test'); test('Blue node',()=>{});\n");
    fs.writeFileSync(path.join(root, "test_blue.py"), "import unittest\nclass BlueTest(unittest.TestCase):\n def test_blue(self): pass\n");
    const result = new BlueTestService(root).discover();
    assert.equal(result.count, 2);
    assert.deepEqual(new Set(result.files.map(file => file.runtime)), new Set(["node", "python"]));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("runs one test, file tests, and all tests with persistent history", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-tests-run-"));
  try {
    const file = path.join(root, "blue.test.cjs");
    fs.writeFileSync(file, "const test=require('node:test'); const assert=require('node:assert/strict');\ntest('Blue passes',()=>assert.equal(2,2));\ntest('Qwen passes',()=>assert.ok(true));\n");
    const service = new BlueTestService(root);
    const discovered = service.discover();
    const one = await service.run({ mode: "test", testId: discovered.files[0].children[0].id });
    const fileRun = await service.run({ mode: "file", file });
    const all = await service.run({ mode: "all" });
    assert.equal(one.state, "passed");
    assert.equal(fileRun.results.length, 2);
    assert.equal(all.state, "passed");
    assert.equal(service.history().length, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("failed results retain source navigation and debug configuration", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-tests-failure-"));
  try {
    const file = path.join(root, "blue.test.cjs");
    fs.writeFileSync(file, "const test=require('node:test'); const assert=require('node:assert/strict');\ntest('Blue fails',()=>assert.equal(1,2));\n");
    const service = new BlueTestService(root);
    const item = service.discover().files[0].children[0];
    const run = await service.run({ mode: "test", testId: item.id });
    assert.equal(run.state, "failed", run.output);
    assert.equal(run.results[0].file, file);
    assert.equal(run.results[0].line, 2);
    assert.equal(service.debugConfiguration(item.id).breakpoints[file][0].line, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
