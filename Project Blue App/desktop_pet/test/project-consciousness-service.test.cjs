"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ProjectConsciousnessService, parseReferences } = require("../project-consciousness-service.cjs");

test("parseReferences finds CommonJS and ESM references", () => {
  assert.deepEqual(parseReferences("const a=require('./a'); import b from './b.js';"), ["./a", "./b.js"]);
});

test("buildGraph creates dependency edges", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-consciousness-"));
  fs.writeFileSync(path.join(root, "a.cjs"), "module.exports=1");
  fs.writeFileSync(path.join(root, "b.cjs"), "require('./a.cjs')");
  const graph = new ProjectConsciousnessService(root).buildGraph();
  assert.equal(graph.nodeCount, 2);
  assert.equal(graph.edgeCount, 1);
  assert.equal(graph.edges[0].to, "a.cjs");
});
