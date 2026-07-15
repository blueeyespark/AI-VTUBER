const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_HISTORY = 100;
const DEFAULT_IGNORED_DIRECTORIES = new Set([".git", ".blue", "node_modules", "__pycache__", ".pytest_cache", ".venv", "venv"]);

function hash(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function languageFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".cjs": "javascript", ".js": "javascript", ".mjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".jsx": "javascript",
    ".py": "python", ".json": "json", ".md": "markdown",
    ".html": "html", ".css": "css", ".scss": "scss",
    ".ps1": "powershell", ".cmd": "bat", ".sh": "shell",
    ".yml": "yaml", ".yaml": "yaml", ".xml": "xml", ".sql": "sql"
  })[extension] || "plaintext";
}

function lineDiff(before, after) {
  const left = String(before).split(/\r?\n/);
  const right = String(after).split(/\r?\n/);
  const rows = [];
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (left[index] === right[index]) rows.push({ kind: "equal", line: index + 1, value: left[index] || "" });
    else {
      if (left[index] !== undefined) rows.push({ kind: "remove", line: index + 1, value: left[index] });
      if (right[index] !== undefined) rows.push({ kind: "add", line: index + 1, value: right[index] });
    }
  }
  return rows;
}

function globExpression(pattern) {
  const normalized = String(pattern || "").trim().replaceAll("\\", "/");
  if (!normalized) return null;
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\0").replaceAll("*", "[^/]*").replaceAll("?", "[^/]").replaceAll("\0", ".*");
  return new RegExp(`^(?:${escaped})$`, "i");
}

function matchesPathFilters(filePath, include, exclude) {
  const normalized = String(filePath).replaceAll("\\", "/");
  const includes = String(include || "").split(",").map(globExpression).filter(Boolean);
  const excludes = String(exclude || "").split(",").map(globExpression).filter(Boolean);
  if (includes.length && !includes.some(expression => expression.test(normalized))) return false;
  return !excludes.some(expression => expression.test(normalized));
}

class BlueEditorService {
  constructor(workspaceRoot, options = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.recoveryRoot = path.resolve(options.recoveryRoot || path.join(this.workspaceRoot, ".blue", "editor-recovery"));
    this.metadataRoot = path.resolve(options.metadataRoot || path.join(this.workspaceRoot, ".blue", "ide"));
    this.settingsPath = path.join(this.metadataRoot, "workspace-settings.json");
    this.recentPath = path.join(this.metadataRoot, "recent-files.json");
    this.sessions = new Map();
  }

  readJson(filePath, fallback) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch { return fallback; }
  }

  writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporary, filePath);
  }

  workspaceSettings() {
    const stored = this.readJson(this.settingsPath, {});
    return {
      ignoredPaths: Array.isArray(stored.ignoredPaths) ? stored.ignoredPaths.filter(value => typeof value === "string").slice(0, 100) : [],
      maxRecentFiles: Math.max(1, Math.min(Number(stored.maxRecentFiles) || 20, 100)),
      additionalRoots: Array.isArray(stored.additionalRoots) ? stored.additionalRoots.filter(value => typeof value === "string" && path.isAbsolute(value) && fs.existsSync(value)).slice(0, 10) : []
    };
  }

  updateWorkspaceSettings(value = {}) {
    const ignoredPaths = Array.isArray(value.ignoredPaths)
      ? value.ignoredPaths.map(item => String(item).replaceAll("\\", "/").replace(/^\.\//, "").trim())
        .filter(item => item && !item.includes("..") && !path.isAbsolute(item)).slice(0, 100)
      : this.workspaceSettings().ignoredPaths;
    const settings = {
      ignoredPaths,
      maxRecentFiles: Math.max(1, Math.min(Number(value.maxRecentFiles) || this.workspaceSettings().maxRecentFiles, 100)),
      additionalRoots: this.workspaceSettings().additionalRoots
    };
    this.writeJson(this.settingsPath, settings);
    return settings;
  }

  workspaceRoots() {
    const roots = [{ id: "primary", name: path.basename(this.workspaceRoot), path: this.workspaceRoot, primary: true }];
    for (const rootPath of this.workspaceSettings().additionalRoots) {
      const resolved = path.resolve(rootPath);
      if (resolved === this.workspaceRoot || roots.some(root => root.path === resolved)) continue;
      roots.push({ id: hash(resolved).slice(0, 10), name: path.basename(resolved), path: resolved, primary: false });
    }
    return roots;
  }

  addWorkspaceRoot(rootPath) {
    const resolved = path.resolve(String(rootPath || ""));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error("The selected workspace root is not a directory.");
    const settings = this.workspaceSettings();
    settings.additionalRoots = [...new Set([...settings.additionalRoots, resolved])].filter(item => path.resolve(item) !== this.workspaceRoot).slice(0, 10);
    this.writeJson(this.settingsPath, settings);
    return this.workspaceRoots();
  }

  removeWorkspaceRoot(rootId) {
    if (!rootId || rootId === "primary") throw new Error("The primary Project Blue root cannot be removed.");
    const settings = this.workspaceSettings();
    settings.additionalRoots = settings.additionalRoots.filter(rootPath => hash(path.resolve(rootPath)).slice(0, 10) !== rootId);
    this.writeJson(this.settingsPath, settings);
    return this.workspaceRoots();
  }

  recordRecent(session) {
    const settings = this.workspaceSettings();
    const current = this.readJson(this.recentPath, []);
    const recent = [{ path: session.path, openedAt: new Date().toISOString() },
      ...current.filter(item => item?.path !== session.path)].slice(0, settings.maxRecentFiles);
    this.writeJson(this.recentPath, recent);
  }

  recentFiles() {
    return this.readJson(this.recentPath, []).filter(item => {
      try { return item?.path && fs.statSync(this.resolveWorkspacePath(item.path)).isFile(); }
      catch { return false; }
    }).slice(0, this.workspaceSettings().maxRecentFiles);
  }

  resolveWorkspacePath(requestedPath) {
    if (!requestedPath || typeof requestedPath !== "string") throw new Error("A workspace-relative file path is required.");
    const normalized = requestedPath.replaceAll("\\", "/");
    const rootMatch = normalized.match(/^@([a-f0-9]{10})\/(.*)$/i);
    const root = rootMatch ? this.workspaceRoots().find(item => item.id === rootMatch[1]) : this.workspaceRoots()[0];
    if (!root) throw new Error("The requested workspace root is no longer registered.");
    const relativeRequest = rootMatch ? rootMatch[2] : normalized;
    const absolute = path.resolve(root.path, relativeRequest);
    const relative = path.relative(root.path, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Blue blocked a path outside the active workspace.");
    return absolute;
  }

  relativePath(absolute) {
    const resolved = path.resolve(absolute);
    const root = this.workspaceRoots().find(item => {
      const relative = path.relative(item.path, resolved);
      return !relative.startsWith("..") && !path.isAbsolute(relative);
    });
    if (!root) throw new Error("The file does not belong to a registered workspace root.");
    const relative = path.relative(root.path, resolved).replaceAll("\\", "/");
    return root.primary ? relative : `@${root.id}/${relative}`;
  }

  open(requestedPath) {
    const absolute = this.resolveWorkspacePath(requestedPath);
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) throw new Error("The requested editor target is not a file.");
    if (stat.size > MAX_FILE_BYTES) throw new Error("The file is too large for Blue's text editor.");
    const content = fs.readFileSync(absolute, "utf8");
    if (content.includes("\0")) throw new Error("Binary files cannot be opened in the text editor.");
    const session = {
      id: hash(absolute).slice(0, 20), path: this.relativePath(absolute), absolute,
      language: languageFor(absolute), content, savedContent: content,
      diskHash: hash(content), diskMtimeMs: stat.mtimeMs, dirty: false,
      version: 1, undo: [], redo: [], openedAt: new Date().toISOString()
    };
    this.sessions.set(session.id, session);
    this.recordRecent(session);
    return this.describe(session, true);
  }

  get(sessionId) {
    const session = this.sessions.get(String(sessionId));
    if (!session) throw new Error("Editor session not found.");
    return session;
  }

  describe(session, includeContent = false) {
    const result = {
      id: session.id, path: session.path, language: session.language,
      dirty: session.dirty, version: session.version,
      canUndo: session.undo.length > 0, canRedo: session.redo.length > 0,
      externalChange: this.externalChange(session)
    };
    if (includeContent) result.content = session.content;
    return result;
  }

  update(sessionId, content) {
    const session = this.get(sessionId);
    const next = String(content);
    if (next === session.content) return this.describe(session, true);
    session.undo.push(session.content);
    if (session.undo.length > MAX_HISTORY) session.undo.shift();
    session.redo = [];
    session.content = next;
    session.dirty = session.content !== session.savedContent;
    session.version += 1;
    this.writeRecovery(session);
    return this.describe(session, true);
  }

  undo(sessionId) {
    const session = this.get(sessionId);
    if (!session.undo.length) return this.describe(session, true);
    session.redo.push(session.content);
    session.content = session.undo.pop();
    session.dirty = session.content !== session.savedContent;
    session.version += 1;
    this.writeRecovery(session);
    return this.describe(session, true);
  }

  redo(sessionId) {
    const session = this.get(sessionId);
    if (!session.redo.length) return this.describe(session, true);
    session.undo.push(session.content);
    session.content = session.redo.pop();
    session.dirty = session.content !== session.savedContent;
    session.version += 1;
    this.writeRecovery(session);
    return this.describe(session, true);
  }

  externalChange(session) {
    if (!fs.existsSync(session.absolute)) return { changed: true, deleted: true };
    const stat = fs.statSync(session.absolute);
    const diskContent = fs.readFileSync(session.absolute, "utf8");
    return { changed: hash(diskContent) !== session.diskHash, deleted: false, mtimeMs: stat.mtimeMs };
  }

  checkExternal(sessionId, options = {}) {
    const session = this.get(sessionId);
    const external = this.externalChange(session);
    if (!external.changed) return { changed: false, reloaded: false, session: this.describe(session, true) };
    if (external.deleted) return { changed: true, deleted: true, reloaded: false, session: this.describe(session, true) };
    if (session.dirty || options.reloadClean === false) {
      return { changed: true, conflict: session.dirty, reloaded: false, session: this.describe(session, true) };
    }
    const stat = fs.statSync(session.absolute);
    if (stat.size > MAX_FILE_BYTES) throw new Error("The externally changed file is too large for Blue's text editor.");
    const content = fs.readFileSync(session.absolute, "utf8");
    if (content.includes("\0")) throw new Error("The externally changed file is now binary.");
    session.content = content;
    session.savedContent = content;
    session.diskHash = hash(content);
    session.diskMtimeMs = stat.mtimeMs;
    session.undo = [];
    session.redo = [];
    session.version += 1;
    return { changed: true, reloaded: true, session: this.describe(session, true) };
  }

  save(sessionId, options = {}) {
    const session = this.get(sessionId);
    const external = this.externalChange(session);
    if (external.changed && !options.overwriteExternal) {
      return { ok: false, conflict: true, external, diff: this.compareWithDisk(sessionId) };
    }
    fs.writeFileSync(session.absolute, session.content, "utf8");
    const stat = fs.statSync(session.absolute);
    session.savedContent = session.content;
    session.diskHash = hash(session.content);
    session.diskMtimeMs = stat.mtimeMs;
    session.dirty = false;
    this.removeRecovery(session);
    return { ok: true, session: this.describe(session, true) };
  }

  find(sessionId, query, options = {}) {
    const session = this.get(sessionId);
    const source = String(query || "");
    if (!source) return [];
    const flags = `g${options.matchCase ? "" : "i"}`;
    const escaped = options.regex ? source : source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(options.wholeWord ? `\\b(?:${escaped})\\b` : escaped, flags);
    const results = [];
    for (const match of session.content.matchAll(expression)) {
      const before = session.content.slice(0, match.index);
      const lines = before.split(/\r?\n/);
      results.push({ index: match.index, length: match[0].length, line: lines.length, column: lines.at(-1).length + 1, value: match[0] });
    }
    return results;
  }

  replace(sessionId, query, replacement, options = {}) {
    const matches = this.find(sessionId, query, options);
    if (!matches.length) return { replacements: 0, session: this.describe(this.get(sessionId), true) };
    const session = this.get(sessionId);
    const source = String(query);
    const flags = `${options.replaceAll === false ? "" : "g"}${options.matchCase ? "" : "i"}`;
    const escaped = options.regex ? source : source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(options.wholeWord ? `\\b(?:${escaped})\\b` : escaped, flags);
    const next = session.content.replace(expression, String(replacement));
    return { replacements: options.replaceAll === false ? 1 : matches.length, session: this.update(sessionId, next) };
  }

  compareWithDisk(sessionId) {
    const session = this.get(sessionId);
    const disk = fs.existsSync(session.absolute) ? fs.readFileSync(session.absolute, "utf8") : "";
    return { path: session.path, before: disk, after: session.content, changes: lineDiff(disk, session.content) };
  }

  writeRecovery(session) {
    if (!session.dirty) return this.removeRecovery(session);
    fs.mkdirSync(this.recoveryRoot, { recursive: true });
    fs.writeFileSync(path.join(this.recoveryRoot, `${session.id}.json`), JSON.stringify({
      path: session.path, content: session.content, version: session.version, savedHash: session.diskHash,
      recoveredAt: new Date().toISOString()
    }, null, 2), "utf8");
  }

  removeRecovery(session) {
    const target = path.join(this.recoveryRoot, `${session.id}.json`);
    if (fs.existsSync(target)) fs.rmSync(target);
  }

  recoverable() {
    if (!fs.existsSync(this.recoveryRoot)) return [];
    return fs.readdirSync(this.recoveryRoot).filter(name => name.endsWith(".json")).map(name => {
      try { return JSON.parse(fs.readFileSync(path.join(this.recoveryRoot, name), "utf8")); }
      catch { return null; }
    }).filter(Boolean);
  }

  restoreRecovery(requestedPath) {
    const normalized = String(requestedPath || "").replaceAll("\\", "/");
    const record = this.recoverable().find(item => String(item.path || "").replaceAll("\\", "/") === normalized);
    if (!record) throw new Error("No recovery snapshot exists for that file.");
    const session = this.open(record.path);
    return this.update(session.id, record.content);
  }

  listWorkspaceFiles(options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit) || 500, 2000));
    const ignored = new Set([...DEFAULT_IGNORED_DIRECTORIES, ...(Array.isArray(options.ignore) ? options.ignore : [])]);
    const configuredIgnores = this.workspaceSettings().ignoredPaths;
    const entries = [];
    const visit = (directory, depth) => {
      if (entries.length >= limit) return;
      const children = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
      for (const child of children) {
        if (entries.length >= limit) break;
        if (ignored.has(child.name)) continue;
        const absolute = path.join(directory, child.name);
        const relative = this.relativePath(absolute);
        const rootRelative = relative.replace(/^@[a-f0-9]{10}\//i, "");
        if (configuredIgnores.some(ignoredPath => rootRelative === ignoredPath || rootRelative.startsWith(`${ignoredPath}/`))) continue;
        if (child.isDirectory()) {
          entries.push({ type: "folder", path: relative, name: child.name, depth });
          visit(absolute, depth + 1);
        } else if (child.isFile()) {
          const stat = fs.statSync(absolute);
          entries.push({ type: "file", path: relative, name: child.name, depth, size: stat.size, language: languageFor(absolute) });
        }
      }
    };
    for (const root of this.workspaceRoots()) {
      if (!root.primary) entries.push({ type: "root", path: `@${root.id}/`, name: root.name, depth: 0, rootId: root.id });
      visit(root.path, root.primary ? 0 : 1);
      if (entries.length >= limit) break;
    }
    return { entries, truncated: entries.length >= limit, workspaceRoot: this.workspaceRoot, roots: this.workspaceRoots().map(root => ({ ...root, path: root.primary ? root.path : undefined })) };
  }

  symbolIndex(options = {}) {
    const symbols = [];
    const limit = Math.max(1, Math.min(Number(options.limit) || 2000, 10000));
    const patterns = {
      javascript: /\b(?:class|function)\s+([A-Za-z_$][\w$]*)|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/g,
      typescript: /\b(?:class|function|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
      python: /^\s*(?:class|def|async\s+def)\s+([A-Za-z_]\w*)/gm
    };
    for (const entry of this.listWorkspaceFiles({ limit: 5000 }).entries) {
      if (entry.type !== "file" || entry.size > MAX_FILE_BYTES || !patterns[entry.language]) continue;
      let content;
      try { content = fs.readFileSync(this.resolveWorkspacePath(entry.path), "utf8"); } catch { continue; }
      const expression = patterns[entry.language];
      expression.lastIndex = 0;
      for (const match of content.matchAll(expression)) {
        const name = match.slice(1).find(Boolean);
        const position = content.slice(0, match.index).split(/\r?\n/);
        symbols.push({ name, path: entry.path, language: entry.language, line: position.length, column: position.at(-1).length + 1 });
        if (symbols.length >= limit) return { symbols, truncated: true };
      }
    }
    return { symbols, truncated: false };
  }

  workspaceSnapshot() {
    const files = this.listWorkspaceFiles({ limit: 5000 }).entries.filter(entry => entry.type === "file");
    return Object.fromEntries(files.map(entry => {
      try { const stat = fs.statSync(this.resolveWorkspacePath(entry.path)); return [entry.path, `${stat.size}:${stat.mtimeMs}`]; }
      catch { return [entry.path, "missing"]; }
    }));
  }

  workspaceChanges(previous = {}) {
    const current = this.workspaceSnapshot();
    const changes = [];
    for (const [filePath, signature] of Object.entries(current)) {
      if (!(filePath in previous)) changes.push({ type: "created", path: filePath });
      else if (previous[filePath] !== signature) changes.push({ type: "changed", path: filePath });
    }
    for (const filePath of Object.keys(previous)) if (!(filePath in current)) changes.push({ type: "deleted", path: filePath });
    return { snapshot: current, changes };
  }

  findReferences(query, options = {}) {
    const source = String(query || "").trim();
    if (!source) return [];
    const limit = Math.max(1, Math.min(Number(options.limit) || 200, 1000));
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(options.wholeWord === false ? escaped : `\\b${escaped}\\b`, options.matchCase ? "g" : "gi");
    const results = [];
    for (const entry of this.listWorkspaceFiles({ limit: 2000 }).entries) {
      if (entry.type !== "file" || entry.size > MAX_FILE_BYTES) continue;
      const absolute = this.resolveWorkspacePath(entry.path);
      let content;
      try { content = fs.readFileSync(absolute, "utf8"); } catch { continue; }
      if (content.includes("\0")) continue;
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        expression.lastIndex = 0;
        for (const match of line.matchAll(expression)) {
          results.push({ path: entry.path, line: index + 1, column: match.index + 1, preview: line.trim().slice(0, 300) });
          if (results.length >= limit) return;
        }
      });
      if (results.length >= limit) break;
    }
    return results;
  }

  searchWorkspace(query, options = {}) {
    const source = String(query || "");
    if (!source) return { query: source, files: [], matches: 0, truncated: false };
    const limit = Math.max(1, Math.min(Number(options.limit) || 500, 5000));
    const flags = `g${options.matchCase ? "" : "i"}`;
    const escaped = options.regex ? source : source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let expression;
    try { expression = new RegExp(options.wholeWord ? `\\b(?:${escaped})\\b` : escaped, flags); }
    catch (error) { throw new Error(`Invalid search expression: ${error.message}`); }
    const grouped = new Map();
    let matches = 0;
    let truncated = false;
    for (const entry of this.listWorkspaceFiles({ limit: 2000 }).entries) {
      if (entry.type !== "file" || entry.size > MAX_FILE_BYTES) continue;
      if (!matchesPathFilters(entry.path, options.include, options.exclude)) continue;
      let content;
      try { content = fs.readFileSync(this.resolveWorkspacePath(entry.path), "utf8"); } catch { continue; }
      if (content.includes("\0")) continue;
      const rows = [];
      for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
        expression.lastIndex = 0;
        for (const match of line.matchAll(expression)) {
          rows.push({ line: lineIndex + 1, column: match.index + 1, length: match[0].length, preview: line.slice(0, 500) });
          matches += 1;
          if (matches >= limit) { truncated = true; break; }
        }
        if (truncated) break;
      }
      if (rows.length) grouped.set(entry.path, rows);
      if (truncated) break;
    }
    return { query: source, matches, truncated, files: [...grouped].map(([filePath, results]) => ({ path: filePath, results })) };
  }

  previewWorkspaceReplace(query, replacement, options = {}) {
    const search = this.searchWorkspace(query, options);
    const previews = search.files.map(file => ({
      path: file.path,
      results: file.results.map(result => ({ ...result, before: result.preview, after: result.preview.slice(0, result.column - 1) + String(replacement) + result.preview.slice(result.column - 1 + result.length) }))
    }));
    return { ...search, replacement: String(replacement), files: previews };
  }

  close(sessionId, options = {}) {
    const session = this.get(sessionId);
    if (session.dirty && !options.discard) return { ok: false, dirty: true, session: this.describe(session) };
    if (options.discard) this.removeRecovery(session);
    this.sessions.delete(session.id);
    return { ok: true };
  }
}

module.exports = { BlueEditorService, languageFor, lineDiff };
