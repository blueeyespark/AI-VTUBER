"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TEXT_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".py", ".json", ".md", ".css", ".html", ".yml", ".yaml", ".toml"]);
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".vrm", ".glb", ".gltf", ".blend", ".wav", ".mp3", ".ogg", ".mp4", ".mkv"]);
const IGNORE = /(^|[\\/])(?:node_modules|\.git|\.blue|dist|build|coverage|\.pytest_cache|vendor)(?:[\\/]|$)/i;

function walk(root, limit = 5000) {
  const files = [];
  const stack = [root];
  while (stack.length && files.length < limit) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (IGNORE.test(full)) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  }
  return files;
}

function parseReferences(text) {
  const refs = new Set();
  for (const pattern of [
    /require\(["']([^"']+)["']\)/g,
    /from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /import\s+[^;]+?\s+from\s+["']([^"']+)["']/g,
    /(?:src|href)=["']([^"']+)["']/g
  ]) {
    let match;
    while ((match = pattern.exec(text))) refs.add(match[1]);
  }
  return [...refs];
}

function parseSymbols(text, extension) {
  const symbols = [];
  const add = (kind, name, line) => { if (name && !symbols.some(item => item.kind === kind && item.name === name)) symbols.push({ kind, name, line }); };
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    let match;
    if ([".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx"].includes(extension)) {
      match = lineText.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/); if (match) add("function", match[1], index + 1);
      match = lineText.match(/^\s*(?:export\s+)?class\s+([\w$]+)/); if (match) add("class", match[1], index + 1);
      match = lineText.match(/^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/); if (match) add("function", match[1], index + 1);
      match = lineText.match(/\b(?:describe|it|test)\s*\(\s*["'`]([^"'`]+)/); if (match) add("test", match[1], index + 1);
    } else if (extension === ".py") {
      match = lineText.match(/^\s*(?:async\s+)?def\s+([\w_]+)/); if (match) add(match[1].startsWith("test_") ? "test" : "function", match[1], index + 1);
      match = lineText.match(/^\s*class\s+([\w_]+)/); if (match) add("class", match[1], index + 1);
    } else if (extension === ".md") {
      match = lineText.match(/^(#{1,6})\s+(.+)/); if (match) add("section", match[2].trim(), index + 1);
    }
  });
  return symbols.slice(0, 500);
}

function resolveReference(file, ref, workspaceRoot) {
  if (!ref || /^(?:[a-z]+:|#|data:)/i.test(ref) || !ref.startsWith(".")) return null;
  const cleanRef = ref.split(/[?#]/)[0];
  const target = path.normalize(path.join(path.dirname(file), cleanRef));
  const candidates = [target, ...[".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".py", ".json"].map(ext => `${target}${ext}`), path.join(target, "index.js")];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  return found && found.startsWith(workspaceRoot) ? found : null;
}

function boundedGit(workspaceRoot, args, fallback = "") {
  try { return execFileSync("git", args, { cwd: workspaceRoot, encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return fallback; }
}

class ProjectConsciousnessService {
  constructor(workspaceRoot) { this.workspaceRoot = path.resolve(workspaceRoot); }

  ownership(limit = 250) {
    const output = boundedGit(this.workspaceRoot, ["log", "-200", "--name-only", "--pretty=format:@@%an"]);
    const owners = new Map(); let owner = "unknown";
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith("@@")) owner = line.slice(2).trim() || "unknown";
      else if (line.trim()) { const rel = line.replaceAll("\\", "/"); const perFile = owners.get(rel) || new Map(); perFile.set(owner, (perFile.get(owner) || 0) + 1); owners.set(rel, perFile); }
    }
    return [...owners.entries()].slice(0, limit).map(([file, counts]) => ({ file, owners: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, commits]) => ({ name, commits })) }));
  }

  coverageSummary() {
    for (const candidate of ["coverage/coverage-summary.json", "coverage-summary.json"]) {
      try {
        const value = JSON.parse(fs.readFileSync(path.join(this.workspaceRoot, candidate), "utf8"));
        const total = value.total || value;
        return { source: candidate, lines: total.lines?.pct ?? null, functions: total.functions?.pct ?? null, branches: total.branches?.pct ?? null, statements: total.statements?.pct ?? null };
      } catch {}
    }
    return { source: null, lines: null, functions: null, branches: null, statements: null };
  }

  planningSignals(files) {
    const signals = { goals: [], milestones: [], risks: [], technicalDebt: [] };
    const patterns = { goals: /\b(?:goal|objective)\b\s*[:\-]?\s*(.+)/i, milestones: /\b(?:milestone|phase)\b\s*[:\-]?\s*(.+)/i, risks: /\b(?:risk|blocker)\b\s*[:\-]?\s*(.+)/i, technicalDebt: /\b(?:TODO|FIXME|technical debt|hack)\b\s*[:\-]?\s*(.+)/i };
    for (const file of files.filter(item => TEXT_EXTENSIONS.has(path.extname(item).toLowerCase())).slice(0, 1500)) {
      let text = ""; try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
      const rel = path.relative(this.workspaceRoot, file).replaceAll("\\", "/");
      text.split(/\r?\n/).forEach((line, index) => {
        for (const [kind, pattern] of Object.entries(patterns)) {
          const match = line.match(pattern);
          if (match && signals[kind].length < 100) signals[kind].push({ file: rel, line: index + 1, text: String(match[1] || line).trim().slice(0, 300) });
        }
      });
    }
    return signals;
  }

  buildGraph() {
    const files = walk(this.workspaceRoot); const nodes = []; const edges = [];
    for (const file of files) {
      const rel = path.relative(this.workspaceRoot, file).replaceAll("\\", "/"); const extension = path.extname(file).toLowerCase();
      const stat = (() => { try { return fs.statSync(file); } catch { return { size: 0 }; } })();
      if (ASSET_EXTENSIONS.has(extension)) { nodes.push({ id: rel, type: "asset", extension: extension.slice(1), bytes: stat.size, lines: 0 }); continue; }
      let text = ""; try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
      const symbols = parseSymbols(text, extension);
      nodes.push({ id: rel, type: /(?:test|spec)/i.test(rel) ? "test-file" : extension.slice(1) || "file", bytes: Buffer.byteLength(text), lines: text.split(/\r?\n/).length, symbolCount: symbols.length });
      for (const symbol of symbols) { const symbolId = `${rel}#${symbol.kind}:${symbol.name}`; nodes.push({ id: symbolId, type: symbol.kind, file: rel, name: symbol.name, line: symbol.line }); edges.push({ from: rel, to: symbolId, kind: "contains" }); }
      for (const ref of parseReferences(text)) { const found = resolveReference(file, ref, this.workspaceRoot); if (found) edges.push({ from: rel, to: path.relative(this.workspaceRoot, found).replaceAll("\\", "/"), kind: "imports" }); }
    }
    const inbound = new Map(); for (const edge of edges) inbound.set(edge.to, (inbound.get(edge.to) || 0) + 1);
    const hotspots = nodes.filter(node => !node.file).sort((a, b) => (inbound.get(b.id) || 0) - (inbound.get(a.id) || 0) || (b.lines || 0) - (a.lines || 0)).slice(0, 20).map(node => ({ ...node, inbound: inbound.get(node.id) || 0 }));
    return { version: 2, generatedAt: new Date().toISOString(), workspaceRoot: this.workspaceRoot, nodeCount: nodes.length, edgeCount: edges.length, nodes, edges, hotspots, ownership: this.ownership(), coverage: this.coverageSummary(), planning: this.planningSignals(files) };
  }

  timeline(limit = 50) {
    const output = boundedGit(this.workspaceRoot, ["log", `-${Math.max(1, Math.min(200, Number(limit) || 50))}`, "--date=iso-strict", "--pretty=format:%H%x1f%ad%x1f%an%x1f%s"]);
    return output ? output.split(/\r?\n/).filter(Boolean).map(line => { const [hash, date, author, subject] = line.split("\x1f"); return { hash, date, author, subject }; }) : [];
  }

  snapshot() {
    const graph = this.buildGraph();
    return { version: 2, generatedAt: new Date().toISOString(), graph: { nodeCount: graph.nodeCount, edgeCount: graph.edgeCount, hotspots: graph.hotspots, coverage: graph.coverage }, ownership: graph.ownership, planning: graph.planning, timeline: this.timeline(25) };
  }

  summary(snapshot = this.snapshot()) {
    const hot = snapshot.graph.hotspots.slice(0, 8).map(item => `- ${item.id}: ${item.inbound} inbound reference(s)`).join("\n");
    const recent = snapshot.timeline.slice(0, 8).map(item => `- ${item.date}: ${item.subject} (${item.author})`).join("\n");
    const coverage = snapshot.graph.coverage?.source ? `${snapshot.graph.coverage.lines ?? "unknown"}% lines` : "no coverage artifact found";
    return [`Project consciousness: ${snapshot.graph.nodeCount} semantic nodes, ${snapshot.graph.edgeCount} relationships; ${coverage}.`, "Architecture hotspots:", hot || "- None detected.", "Recent project timeline:", recent || "- No Git history detected.", `Planning signals: ${snapshot.planning.goals.length} goals, ${snapshot.planning.milestones.length} milestones, ${snapshot.planning.risks.length} risks, ${snapshot.planning.technicalDebt.length} debt markers.`].join("\n");
  }
}

module.exports = { ProjectConsciousnessService, parseReferences, parseSymbols, walk };
