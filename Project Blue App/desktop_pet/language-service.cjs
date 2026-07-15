const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL, fileURLToPath } = require("node:url");

const LANGUAGE_BY_EXTENSION = Object.freeze({
  ".js": "javascript", ".jsx": "javascriptreact", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescriptreact", ".mts": "typescript", ".cts": "typescript", ".py": "python"
});
const SERVER_BY_LANGUAGE = Object.freeze({ javascript: "typescript", javascriptreact: "typescript", typescript: "typescript", typescriptreact: "typescript", python: "python" });

function within(root, candidate) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function uriFor(filePath) { return pathToFileURL(filePath).href; }
function fileFor(uri) { return fileURLToPath(uri); }
function languageFor(filePath) { return LANGUAGE_BY_EXTENSION[path.extname(filePath).toLowerCase()] || "plaintext"; }
function position(line = 1, character = 1) { return { line: Math.max(0, Number(line || 1) - 1), character: Math.max(0, Number(character || 1) - 1) }; }
function offsetAt(text, point) { const lines = String(text).split(/\n/); const line = Math.max(0, Math.min(lines.length - 1, Number(point?.line) || 0)); let offset = 0; for (let index = 0; index < line; index += 1) offset += lines[index].length + 1; return offset + Math.max(0, Math.min(lines[line].length, Number(point?.character) || 0)); }
function applyTextEdits(text, edits) { let output = String(text); const ranged = (edits || []).map(edit => ({ edit, start: offsetAt(output, edit.range.start), end: offsetAt(output, edit.range.end) })).sort((a, b) => b.start - a.start); for (const item of ranged) output = `${output.slice(0, item.start)}${item.edit.newText || ""}${output.slice(item.end)}`; return output; }

class LspConnection extends EventEmitter {
  constructor(id, command, args, cwd) { super(); this.id = id; this.command = command; this.args = args; this.cwd = cwd; this.process = null; this.buffer = Buffer.alloc(0); this.sequence = 0; this.pending = new Map(); this.capabilities = {}; this.ready = false; }
  start() {
    if (this.process) return;
    this.process = spawn(this.command, this.args, { cwd: this.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.process.stdout.on("data", chunk => this.consume(chunk));
    this.process.stderr.on("data", chunk => this.emit("log", String(chunk)));
    this.process.on("exit", (code, signal) => { this.ready = false; this.process = null; for (const { reject } of this.pending.values()) reject(new Error(`${this.id} language server exited (${code ?? signal}).`)); this.pending.clear(); this.emit("exit", { code, signal }); });
    this.process.on("error", error => this.emit("error", error));
  }
  send(message) { if (!this.process?.stdin?.writable) throw new Error(`${this.id} language server is not running.`); const body = Buffer.from(JSON.stringify(message), "utf8"); this.process.stdin.write(`Content-Length: ${body.length}\r\n\r\n`); this.process.stdin.write(body); }
  request(method, params, timeout = 15000) {
    const id = ++this.sequence; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out.`)); }, timeout); this.pending.set(id, { resolve, reject, timer }); this.send({ jsonrpc: "2.0", id, method, params }); });
  }
  notify(method, params) { this.send({ jsonrpc: "2.0", method, params }); }
  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const boundary = this.buffer.indexOf("\r\n\r\n"); if (boundary < 0) return;
      const header = this.buffer.subarray(0, boundary).toString("ascii"); const match = header.match(/Content-Length:\s*(\d+)/i); if (!match) { this.buffer = this.buffer.subarray(boundary + 4); continue; }
      const length = Number(match[1]); if (this.buffer.length < boundary + 4 + length) return;
      const body = this.buffer.subarray(boundary + 4, boundary + 4 + length); this.buffer = this.buffer.subarray(boundary + 4 + length);
      try { this.dispatch(JSON.parse(body.toString("utf8"))); } catch (error) { this.emit("error", error); }
    }
  }
  dispatch(message) {
    if (message.id !== undefined && ("result" in message || "error" in message)) { const pending = this.pending.get(message.id); if (!pending) return; clearTimeout(pending.timer); this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message || "LSP request failed.")) : pending.resolve(message.result); return; }
    if (message.id !== undefined && message.method) {
      let result = null;
      if (message.method === "workspace/configuration") result = (message.params?.items || []).map(() => ({}));
      if (message.method === "workspace/workspaceFolders") { const rootUri = uriFor(this.cwd); result = [{ uri: rootUri, name: path.basename(this.cwd) }]; }
      this.send({ jsonrpc: "2.0", id: message.id, result }); this.emit("notification", { ...message, serverRequest: true }); return;
    }
    if (message.method) this.emit("notification", message);
  }
  async initialize(root) {
    this.start(); const rootUri = uriFor(root);
    const result = await this.request("initialize", { processId: process.pid, clientInfo: { name: "Project Blue", version: "2.3.0" }, rootUri, workspaceFolders: [{ uri: rootUri, name: path.basename(root) }], capabilities: { workspace: { configuration: true, workspaceFolders: true, symbol: {} }, textDocument: { synchronization: { didSave: true }, completion: { completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"] } }, hover: { contentFormat: ["markdown", "plaintext"] }, signatureHelp: {}, definition: {}, references: {}, rename: { prepareSupport: true }, formatting: {}, codeAction: {}, semanticTokens: { requests: { full: true }, tokenTypes: [], tokenModifiers: [], formats: ["relative"] }, documentSymbol: {} } } }, 30000);
    this.capabilities = result?.capabilities || {}; this.ready = true; this.notify("initialized", {});
    if (this.id === "python") this.notify("workspace/didChangeConfiguration", { settings: { python: { analysis: { diagnosticMode: "workspace", typeCheckingMode: "basic", autoSearchPaths: true, useLibraryCodeForTypes: true } } } });
    return this.capabilities;
  }
  async stop() {
    const child = this.process; if (!child) return;
    const exited = new Promise(resolve => child.once("exit", resolve));
    try { await this.request("shutdown", null, 3000); this.notify("exit", null); } catch { child.kill(); }
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1000))]); }
    if (this.process === child) this.process = null; this.ready = false;
  }
}

class BlueLanguageService extends EventEmitter {
  constructor(workspaceRoot, options = {}) {
    super(); this.workspaceRoot = path.resolve(workspaceRoot); this.moduleRoot = options.moduleRoot || __dirname; this.connections = new Map(); this.documents = new Map(); this.diagnostics = new Map();
  }
  profiles() {
    return [
      { id: "typescript", label: "TypeScript / JavaScript", languages: ["javascript", "javascriptreact", "typescript", "typescriptreact"], entry: path.join(this.moduleRoot, "node_modules", "typescript-language-server", "lib", "cli.mjs") },
      { id: "python", label: "Python (Pyright)", languages: ["python"], entry: path.join(this.moduleRoot, "node_modules", "pyright", "langserver.index.js") }
    ].map(profile => ({ ...profile, installed: fs.existsSync(profile.entry) }));
  }
  safeFile(filePath) { const resolved = path.resolve(this.workspaceRoot, String(filePath || "")); if (!within(this.workspaceRoot, resolved)) throw new Error("Language services are confined to the Project Blue workspace."); return resolved; }
  async connectionForLanguage(language) {
    const serverId = SERVER_BY_LANGUAGE[language]; if (!serverId) throw new Error(`No language server is configured for ${language}.`);
    let connection = this.connections.get(serverId); if (connection?.ready) return connection;
    const profile = this.profiles().find(item => item.id === serverId); if (!profile?.installed) throw new Error(`${profile?.label || serverId} language server is not installed.`);
    connection = new LspConnection(serverId, process.execPath, [profile.entry, "--stdio"], this.workspaceRoot); this.connections.set(serverId, connection);
    connection.on("notification", message => this.handleNotification(serverId, message)); connection.on("log", data => this.emit("event", { type: "log", serverId, data: String(data).slice(-8000) })); connection.on("error", error => this.emit("event", { type: "error", serverId, message: error.message }));
    await connection.initialize(this.workspaceRoot); this.emit("event", { type: "ready", serverId }); return connection;
  }
  handleNotification(serverId, message) {
    if (message.method === "textDocument/publishDiagnostics") { const filePath = this.safeFile(fileFor(message.params.uri)); const diagnostics = message.params.diagnostics || []; this.diagnostics.set(filePath, diagnostics); this.emit("event", { type: "diagnostics", serverId, filePath, diagnostics }); }
    else this.emit("event", { type: "notification", serverId, method: message.method, params: message.params });
  }
  async open(value) {
    const filePath = this.safeFile(value?.path); const language = value?.language || languageFor(filePath); const connection = await this.connectionForLanguage(language); const uri = uriFor(filePath); const existing = this.documents.get(filePath); const requestedVersion = Number(value?.version) || 1; const version = existing ? Math.max(existing.version + 1, requestedVersion) : requestedVersion; const text = value?.text ?? fs.readFileSync(filePath, "utf8");
    if (!existing) connection.notify("textDocument/didOpen", { textDocument: { uri, languageId: language, version, text } }); else connection.notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] });
    this.documents.set(filePath, { uri, language, version, text, serverId: SERVER_BY_LANGUAGE[language] }); return { path: filePath, uri, language, version, serverId: SERVER_BY_LANGUAGE[language] };
  }
  async context(value) { const document = await this.open(value); return { document, connection: await this.connectionForLanguage(document.language), params: { textDocument: { uri: document.uri }, position: position(value?.line, value?.character) } }; }
  async completion(value) { const { connection, params } = await this.context(value); return connection.request("textDocument/completion", { ...params, context: { triggerKind: 1 } }); }
  async hover(value) { const { connection, params } = await this.context(value); return connection.request("textDocument/hover", params); }
  async signature(value) { const { connection, params } = await this.context(value); return connection.request("textDocument/signatureHelp", { ...params, context: { triggerKind: 1, isRetrigger: false } }); }
  async definition(value) { const { connection, params } = await this.context(value); return connection.request("textDocument/definition", params); }
  async references(value) { const { connection, params } = await this.context(value); return connection.request("textDocument/references", { ...params, context: { includeDeclaration: true } }); }
  async rename(value) { const { connection, params } = await this.context(value); const newName = String(value?.newName || "").trim(); if (!/^[A-Za-z_$][\w$]*$/.test(newName)) throw new Error("Enter a valid symbol name."); return connection.request("textDocument/rename", { ...params, newName }); }
  async formatting(value) { const document = await this.open(value); const connection = await this.connectionForLanguage(document.language); return connection.request("textDocument/formatting", { textDocument: { uri: document.uri }, options: { tabSize: Math.max(1, Math.min(8, Number(value?.tabSize) || 2)), insertSpaces: value?.insertSpaces !== false } }); }
  async codeActions(value) { const { connection, params } = await this.context(value); const end = position(value?.endLine || value?.line, value?.endCharacter || value?.character); return connection.request("textDocument/codeAction", { textDocument: params.textDocument, range: { start: params.position, end }, context: { diagnostics: this.diagnostics.get(this.safeFile(value.path)) || [] } }); }
  async semanticTokens(value) { const document = await this.open(value); const connection = await this.connectionForLanguage(document.language); return connection.request("textDocument/semanticTokens/full", { textDocument: { uri: document.uri } }); }
  async documentSymbols(value) { const document = await this.open(value); const connection = await this.connectionForLanguage(document.language); return connection.request("textDocument/documentSymbol", { textDocument: { uri: document.uri } }); }
  async workspaceSymbols(query) { const connections = await Promise.all(this.profiles().filter(x => x.installed).map(x => this.connectionForLanguage(x.languages[0]))); const results = await Promise.all(connections.map(connection => connection.request("workspace/symbol", { query: String(query || "") }).catch(() => []))); return results.flat(); }
  async applyWorkspaceEdit(edit, approved = false) {
    if (!approved) throw new Error("Applying language-server edits requires explicit approval.");
    const groups = new Map();
    for (const [uri, edits] of Object.entries(edit?.changes || {})) groups.set(uri, edits);
    for (const change of edit?.documentChanges || []) if (change?.textDocument?.uri && Array.isArray(change.edits)) groups.set(change.textDocument.uri, change.edits);
    if (!groups.size) return { applied: false, files: [], reason: "The language server returned no edits." };
    const planned = [];
    for (const [uri, edits] of groups) {
      const filePath = this.safeFile(fileFor(uri)); const relative = path.relative(this.workspaceRoot, filePath).replace(/\\/g, "/");
      if (/(^|\/)(\.env(?:\.|$)|\.git|node_modules)(\/|$)/i.test(relative)) throw new Error(`Protected path cannot be edited: ${relative}`);
      const before = fs.readFileSync(filePath, "utf8"); planned.push({ filePath, relative, before, after: applyTextEdits(before, edits) });
    }
    const backupRoot = path.join(this.workspaceRoot, "Project Blue App", ".blue", "lsp-backups", String(Date.now()));
    for (const item of planned) { const backup = path.join(backupRoot, item.relative); fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.writeFileSync(backup, item.before, "utf8"); }
    for (const item of planned) { const temporary = `${item.filePath}.blue-lsp-${process.pid}.tmp`; fs.writeFileSync(temporary, item.after, "utf8"); fs.renameSync(temporary, item.filePath); }
    return { applied: true, files: planned.map(item => item.relative), backupRoot };
  }
  async status() { return { profiles: this.profiles().map(({ entry, ...profile }) => ({ ...profile, running: Boolean(this.connections.get(profile.id)?.ready) })), openDocuments: this.documents.size, diagnosticFiles: this.diagnostics.size }; }
  async stopAll() { await Promise.all([...this.connections.values()].map(connection => connection.stop())); this.connections.clear(); }
}

module.exports = { BlueLanguageService, LspConnection, applyTextEdits, languageFor, position, uriFor };
