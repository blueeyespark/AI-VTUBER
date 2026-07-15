const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlueLanguageService, applyTextEdits, languageFor } = require("../language-service.cjs");

test("maps Python and JavaScript/TypeScript files to real language profiles", () => {
  assert.equal(languageFor("blue.py"), "python"); assert.equal(languageFor("blue.js"), "javascript"); assert.equal(languageFor("blue.ts"), "typescript"); assert.equal(languageFor("notes.txt"), "plaintext");
});

test("applies LSP text edits in reverse source order", () => {
  const output = applyTextEdits("alpha beta", [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "Blue" }, { range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } }, newText: "AI" }]);
  assert.equal(output, "Blue AI");
});

test("real Pyright and TypeScript language servers initialize and answer requests", { timeout: 90000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-lsp-"));
  const javascript = path.join(root, "blue.ts"); const python = path.join(root, "blue.py");
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", strict: true }, include: ["blue.ts"] }), "utf8");
  fs.writeFileSync(javascript, "export function greet(name: string): string { return name.toUpperCase(); }\nexport const result = greet('Blue');\n", "utf8");
  fs.writeFileSync(python, "def greet(name: str) -> str:\n    return name.upper()\n\nresult = greet('Blue')\n", "utf8");
  const service = new BlueLanguageService(root, { moduleRoot: path.resolve(__dirname, "..") });
  const events = []; service.on("event", event => events.push(event));
  t.after(async () => { await service.stopAll(); fs.rmSync(root, { recursive: true, force: true }); });
  const profiles = service.profiles(); assert.equal(profiles.every(profile => profile.installed), true);
  const jsDoc = await service.open({ path: javascript, language: "typescript", version: 1 });
  const pyDoc = await service.open({ path: python, language: "python", version: 1 });
  assert.equal(jsDoc.serverId, "typescript"); assert.equal(pyDoc.serverId, "python");
  await new Promise(resolve => setTimeout(resolve, 2500));
  const [jsSymbols, pySymbols, jsHover, pyHover] = await Promise.all([
    service.documentSymbols({ path: javascript }), service.documentSymbols({ path: python }),
    service.hover({ path: javascript, line: 2, character: 23 }), service.hover({ path: python, line: 4, character: 12 })
  ]);
  assert.ok(jsHover, `TypeScript server should return hover information: ${JSON.stringify({ jsSymbols, jsHover })}`); assert.ok(pyHover, `Pyright should return hover information: ${JSON.stringify({ pySymbols, pyHover, events })}`);
  assert.ok(Array.isArray(jsSymbols), "TypeScript server should answer document-symbol requests");
  assert.ok(Array.isArray(pySymbols), "Pyright should answer document-symbol requests");
  const status = await service.status(); assert.equal(status.profiles.every(profile => profile.running), true);
});

test("workspace edits require approval, create backups, and stay in the workspace", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blue-lsp-edit-")); const file = path.join(root, "blue.py"); fs.writeFileSync(file, "value = 1\n", "utf8");
  const service = new BlueLanguageService(root, { moduleRoot: path.resolve(__dirname, "..") }); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const edit = { changes: { [new URL(`file:///${file.replace(/\\/g, "/")}`).href]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "answer" }] } };
  await assert.rejects(service.applyWorkspaceEdit(edit, false), /approval/); const result = await service.applyWorkspaceEdit(edit, true); assert.equal(result.applied, true); assert.equal(fs.readFileSync(file, "utf8"), "answer = 1\n"); assert.equal(fs.existsSync(result.backupRoot), true);
});
