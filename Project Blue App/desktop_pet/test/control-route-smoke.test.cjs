const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { auditControlCenter } = require("../control-audit.cjs");

const desktopPetRoot = path.resolve(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(desktopPetRoot, name), "utf8");
}

function values(source, expression, group = 1) {
  return [...source.matchAll(expression)].map(match => match[group]);
}

function unique(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

test("every visible route, button, and backend bridge leads somewhere", () => {
  const html = read("index.html");
  const renderer = read("control.js");
  const preload = read("preload.cjs");
  const main = read("main.cjs");
  const audit = auditControlCenter(desktopPetRoot);

  const panels = unique(values(html, /\bdata-panel\s*=\s*["']([^"']+)["']/gi));
  const tabs = unique(values(html, /\bdata-tab\s*=\s*["']([^"']+)["']/gi));
  const routes = unique(values(html, /\bdata-open-tab\s*=\s*["']([^"']+)["']/gi));
  const ids = new Set(values(html, /\bid\s*=\s*["']([^"']+)["']/gi));
  const buttonIds = unique(values(html, /<button\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi));
  const selectorIds = new Set([
    ...values(renderer, /querySelector\(\s*["']#([A-Za-z0-9_-]+)["']\s*\)/g),
    ...values(renderer, /getElementById\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)
  ]);
  const bridgeUsed = unique(values(renderer, /window\.bluePet\.([A-Za-z0-9_]+)/g));
  const bridgeExposed = unique(values(preload, /^\s{2}([A-Za-z_$][\w$]*)\s*:/gm));
  const invokeChannels = unique(values(preload, /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g));
  const sendChannels = unique(values(preload, /ipcRenderer\.send\(\s*["']([^"']+)["']/g));
  const handledChannels = new Set([
    ...values(main, /trustedHandle\(\s*["']([^"']+)["']/g),
    ...values(main, /ipcMain\.handle\(\s*["']([^"']+)["']/g)
  ]);
  const listenedChannels = new Set([
    ...values(main, /trustedOn\(\s*["']([^"']+)["']/g),
    ...values(main, /ipcMain\.on\(\s*["']([^"']+)["']/g)
  ]);

  assert.deepEqual(routes.filter(route => !panels.includes(route)), [], "data-open-tab route without panel");
  assert.deepEqual(tabs.filter(tab => !panels.includes(tab)), [], "data-tab route without panel");
  assert.deepEqual(buttonIds.filter(id => !selectorIds.has(id)), [], "button id not handled by renderer");
  assert.deepEqual([...selectorIds].filter(id => !ids.has(id)), [], "renderer selector points to missing element");
  assert.deepEqual(bridgeUsed.filter(method => !bridgeExposed.includes(method)), [], "renderer uses missing preload bridge method");
  assert.deepEqual(invokeChannels.filter(channel => !handledChannels.has(channel)), [], "preload invoke channel has no main handler");
  assert.deepEqual(sendChannels.filter(channel => !listenedChannels.has(channel)), [], "preload send channel has no main listener");
  assert.deepEqual(audit.placement.misplacedControls, [], "mapped button is in the wrong workspace");
  assert.equal(audit.ok, true, audit.issues.join("\n"));
});

test("control panel avoids dead decorative tabs and duplicate chat shortcuts", () => {
  const html = read("index.html");
  const renderer = read("control.js");

  assert.equal(
    /<button\b[^>]*class=["'][^"']*editor-tab/i.test(html),
    false,
    "decorative editor tabs should not be clickable buttons"
  );
  assert.equal(
    /id=["']chatExplorer(?:Files|Images|Ocr|Idea|Research|Agent)["']/i.test(html),
    false,
    "chat side panel should not duplicate composer buttons"
  );
  assert.equal(
    /chatExplorer(?:Files|Images|Ocr|Idea|Research|Agent)/.test(renderer),
    false,
    "renderer should not keep stale duplicate chat shortcut handlers"
  );
  assert.equal(
    /<div class=["']nav-scroll["'] hidden>/i.test(html),
    false,
    "hamburger side navigation must not be permanently hidden"
  );
});

test("registered workbench activities have complete metadata", () => {
  const vm = require("node:vm");
  const source = read("ui/shell/app-shell.js");
  const context = { window: {}, console: { warn() {}, log() {}, error() {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  const shell = context.window.ProjectBlueShell;
  assert.ok(shell, "ProjectBlueShell should be registered");
  for (const activity of shell.activities) {
    assert.ok(activity.id, "activity id missing");
    assert.ok(activity.label, `${activity.id} label missing`);
    assert.ok(activity.tooltip, `${activity.id} tooltip missing`);
    assert.ok(activity.svgIcon, `${activity.id} svgIcon missing`);
    assert.ok(activity.sidebarView, `${activity.id} sidebarView missing`);
    assert.equal(String(activity.svgIcon).includes("undefined"), false, `${activity.id} icon rendered undefined`);
    assert.ok(shell.sidebarItems[activity.sidebarView] || shell.sidebarItems[activity.id], `${activity.id} sidebar view missing`);
  }
});

test("workbench follows the consolidated VS Code-style information architecture", () => {
  const vm = require("node:vm");
  const source = read("ui/shell/app-shell.js");
  const html = read("index.html");
  const renderer = read("control.js");
  const context = { window: {}, console: { warn() {}, log() {}, error() {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  const shell = context.window.ProjectBlueShell;

  assert.equal(shell.activities.some(activity => ["research", "generator"].includes(activity.id)), false, "research and generation belong inside Workspace");
  for (const editor of ["research-lab", "idea-lab", "blueprint-editor", "generated-result", "asset-generator", "animation-generator"]) {
    assert.ok(shell.editors.workspace.some(item => item.id === editor), `${editor} should be a Workspace editor`);
    assert.match(html, new RegExp(`data-panel=["']workspace["'][^>]+data-editor=["']${editor}["']`), `${editor} panel should mount only in Workspace`);
  }
  for (const activity of shell.activities) assert.ok(shell.sidebarGroups[activity.id]?.length, `${activity.id} should have grouped sidebar views`);
  assert.equal(values(html, /\bdata-bottom-view\s*=\s*["']([^"']+)["']/gi).length, 8, "each bottom-panel tab needs its own preserved view");
  assert.doesNotMatch(renderer, /bottomPanelOutput\.textContent\s*=\s*`\$\{tab\} panel ready\.`/, "switching panels must not erase their output");
  assert.match(renderer, /aria-selected/, "bottom panel tabs should expose selection to assistive technology");
});

test("Phase 1 editor foundation is wired as a complete workbench capability", () => {
  const html = read("index.html");
  const renderer = read("control.js");
  const packageJson = JSON.parse(read("package.json"));
  assert.ok(packageJson.dependencies?.["monaco-editor"], "Monaco editor dependency is required");
  for (const id of ["monacoEditorPrimary", "monacoEditorSecondary", "monacoDiffEditor", "editorBreadcrumbs", "editorFind", "editorReplace", "editorSplit", "editorRecover"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from the workbench`);
  }
  for (const capability of ["initializeMonacoEditor", "onDidChangeModelContent", "editorDiff", "editorRecovery", "pollOpenFileChanges", "previewFileEditorId", "pinnedFileEditors"]) {
    assert.match(renderer, new RegExp(capability), `${capability} is not wired`);
  }
});

test("Phase 2 workspace system exposes every required capability", () => {
  const service = read("editor-service.cjs");
  const workbench = read("control.js") + read("preload.cjs");
  for (const capability of ["workspaceRoots", "addWorkspaceRoot", "removeWorkspaceRoot", "listWorkspaceFiles", "workspaceSnapshot", "workspaceChanges", "symbolIndex", "findReferences", "recentFiles", "workspaceSettings", "updateWorkspaceSettings"]) {
    assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from the workspace service`);
  }
  for (const capability of ["editorRootAdd", "editorRootRemove", "editorSymbols", "editorWorkspaceChanges", "pollWorkspaceChanges"]) {
    assert.match(workbench, new RegExp(capability), `${capability} is not exposed to the workbench`);
  }
});

test("Phase 3 workspace search satisfies the complete roadmap acceptance", () => {
  const html = read("index.html");
  const renderer = read("control.js");
  const service = read("editor-service.cjs");
  const bridge = read("preload.cjs") + read("main.cjs");

  for (const id of [
    "editorFind",
    "editorReplace",
    "workbenchSearchInput",
    "workbenchSearchRegex",
    "workbenchSearchCase",
    "workbenchSearchWord",
    "workbenchSearchInclude",
    "workbenchSearchExclude",
    "workbenchSearchResults"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from search`);
  }
  for (const capability of ["searchWorkspace", "previewWorkspaceReplace"]) {
    assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from the guarded editor service`);
  }
  for (const capability of ["runWorkbenchSearch", "renderWorkspaceSearchResults", "openWorkspaceFile", "focusEditorRange", "editorWorkspaceSearch", "editorReplacePreview"]) {
    assert.match(renderer + bridge, new RegExp(capability), `${capability} is not wired through the workbench`);
  }
});

test("Phase 4 terminal and tasks satisfy the complete roadmap acceptance", () => {
  const service = read("terminal-service.cjs");
  const html = read("index.html");
  const renderer = read("control.js");
  const bridge = read("preload.cjs") + read("main.cjs");
  assert.match(service, /require\(["']node-pty["']\)/, "Phase 4 requires real PTY sessions");
  for (const profile of ["powershell", "cmd", "git-bash", "python"]) assert.match(service, new RegExp(`id: ["']${profile}["']`), `${profile} profile is missing`);
  for (const capability of ["create", "write", "resize", "close", "listTasks", "saveTask", "runTask"]) assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from terminal service`);
  for (const id of ["terminalProfile", "terminalCwd", "terminalNew", "terminalSplit", "terminalKill", "terminalTabs", "terminalOutput", "terminalInput", "taskList", "taskForm", "taskType", "taskCommand"]) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from Run and Tasks`);
  for (const capability of ["terminalCreate", "terminalWrite", "terminalResize", "terminalClose", "taskList", "taskSave", "taskRun", "onTerminalEvent", "createTerminal", "refreshTasks"]) assert.match(renderer + bridge, new RegExp(capability), `${capability} is not wired through the workbench`);
});

test("Phase 5 Git integration satisfies the complete roadmap acceptance", () => {
  const service = read("git-service.cjs");
  const html = read("index.html");
  const renderer = read("control.js");
  const bridge = read("preload.cjs") + read("main.cjs");
  for (const capability of ["discover", "status", "diff", "stage", "unstage", "branches", "switchBranch", "commit", "pull", "push", "history", "attribution"]) assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from the guarded Git service`);
  for (const id of ["gitChangeList", "gitStageSelected", "gitUnstageSelected", "gitDiffSelected", "gitAttribution", "gitCommitMessage", "gitApproval", "gitCommit", "gitBranchSelect", "gitSwitch", "gitPull", "gitPush", "gitDiffOutput"]) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from Source Control`);
  for (const capability of ["workspaceGit", "gitDiff", "gitStage", "gitUnstage", "gitBranches", "gitSwitch", "gitCommit", "gitPull", "gitPush", "gitHistory", "gitAttribution", "renderGitState", "approvedGitAction"]) assert.match(renderer + bridge, new RegExp(capability), `${capability} is not wired through the workbench`);
  assert.match(service, /--ff-only/, "pull must not create an implicit merge");
  assert.doesNotMatch(service, /reset\s+--hard|clean\s+-f/, "destructive Git commands are forbidden");
});

test("Phase 6 language intelligence satisfies the complete roadmap acceptance", () => {
  const service = read("language-service.cjs");
  const html = read("index.html");
  const renderer = read("control.js");
  const bridge = read("preload.cjs") + read("main.cjs");
  const packageJson = JSON.parse(read("package.json"));
  for (const dependency of ["pyright", "typescript", "typescript-language-server"]) assert.ok(packageJson.dependencies?.[dependency], `${dependency} is required for real language intelligence`);
  for (const capability of ["completion", "hover", "signature", "definition", "references", "rename", "formatting", "codeActions", "semanticTokens", "documentSymbols", "workspaceSymbols"]) assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from the language service`);
  for (const id of ["lspServerState", "lspCompletion", "lspHover", "lspSignature", "lspDefinition", "lspReferences", "lspRename", "lspFormat", "lspCodeActions", "lspSymbols", "lspWorkspaceSymbols", "lspResult"]) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from the editor`);
  for (const capability of ["lspOpen", "lspCompletion", "lspHover", "lspSignature", "lspDefinition", "lspReferences", "lspRename", "lspFormatting", "lspCodeActions", "lspSemanticTokens", "lspDocumentSymbols", "lspWorkspaceSymbols", "lspApplyEdit", "onLspEvent"]) assert.match(renderer + bridge, new RegExp(capability), `${capability} is not wired through the workbench`);
  assert.match(service, /Pyright/, "Python must use the real Pyright language server");
  assert.match(service, /typescript-language-server/, "JavaScript and TypeScript must use the real TypeScript language server");
  assert.match(service, /Applying language-server edits requires explicit approval/, "workspace edits must be approval-gated");
});

test("Phase 7 debugging satisfies the complete roadmap acceptance", () => {
  const service = read("debug-service.cjs");
  const adapter = read("node-debug-adapter.cjs");
  const html = read("index.html");
  const renderer = read("control.js");
  const bridge = read("preload.cjs") + read("main.cjs");
  for (const capability of ["adapters", "profiles", "saveProfile", "start", "setBreakpoints", "command", "stop", "stopAll"]) assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from the debug service`);
  for (const command of ["initialize", "launch", "attach", "setBreakpoints", "configurationDone", "continue", "pause", "next", "stepIn", "stepOut", "stackTrace", "scopes", "variables", "evaluate", "disconnect"]) assert.match(adapter, new RegExp(`["]${command}["]`), `${command} is missing from the Node DAP adapter`);
  for (const id of ["debugRuntime", "debugRequest", "debugProgram", "debugCwd", "debugStart", "debugStop", "debugContinue", "debugPause", "debugStepOver", "debugStepInto", "debugStepOut", "debugProfileName", "debugArgs", "debugAttachUrl", "debugProfileSave", "debugBreakpoints", "debugApplyBreakpoints", "debugWatchExpression", "debugWatch", "debugCallStack", "debugVariables", "debugConsole", "debugConsoleInput", "debugEvaluate", "debugStatus"]) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from Run and Debug`);
  for (const capability of ["debugStatus", "debugProfiles", "debugProfileSave", "debugStart", "debugList", "debugBreakpoints", "debugCommand", "debugStop", "onDebugEvent", "runDebugCommand", "refreshDebugStack"]) assert.match(renderer + bridge, new RegExp(capability), `${capability} is not wired through the workbench`);
  assert.match(service, /debugpy\.adapter/, "Python debugging must use the local Debugpy adapter");
  assert.match(adapter, /--inspect-brk=0/, "Node debugging must use the Node Inspector protocol");
  assert.match(adapter, /supportsConditionalBreakpoints:\s*true/, "conditional breakpoints must be advertised");
});

test("Phase 8 testing satisfies the complete roadmap acceptance", () => {
  const service = read("test-service.cjs");
  const html = read("index.html");
  const renderer = read("control.js");
  const bridge = read("preload.cjs") + read("main.cjs");
  for (const capability of ["discover", "run", "runGroup", "history", "debugConfiguration"]) assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from the test service`);
  for (const mode of ["test", "file", "all"]) assert.match(service, new RegExp(`["]${mode}["]`), `${mode} test mode is missing`);
  for (const id of ["testSummary", "testDiscover", "testRunAll", "testRunFile", "testRunSelected", "testDebugSelected", "testExplorer", "testHistory", "testResults", "testOutput"]) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from Test Explorer`);
  for (const capability of ["testDiscover", "testRun", "testHistory", "testDebug", "onTestEvent", "discoverWorkspaceTests", "runWorkspaceTests", "renderTestExplorer", "renderTestRun", "refreshTestHistory", "openWorkspaceFile"]) assert.match(renderer + bridge, new RegExp(capability), `${capability} is not wired through the workbench`);
  assert.match(service, /\.blue["'], ["']testing["'], ["']history\.json/, "test history must persist inside the workspace");
  assert.match(service, /NODE_TEST_CONTEXT/, "child Node tests must be isolated from Blue's parent test runner");
});

test("Phase 9 extensions satisfy the complete roadmap acceptance", () => {
  const service = read("extension-service.cjs");
  const host = read("extension-host.cjs");
  const manifest = JSON.parse(read("sample-extension/blue-extension.json"));
  const html = read("index.html");
  const renderer = read("control.js");
  const bridge = read("preload.cjs") + read("main.cjs");
  for (const capability of ["validateManifest", "validateDependencies", "install", "update", "uninstall", "setEnabled", "activate", "deactivate", "executeCommand", "contributions"]) assert.match(service, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from the extension service`);
  for (const contribution of ["commands", "views", "editors", "languages", "settings"]) assert.equal(manifest.contributes[contribution].length, 1, `sample ${contribution} contribution is missing`);
  for (const id of ["extensionRefresh", "extensionInstallSample", "extensionSource", "extensionApproval", "extensionInstall", "extensionList", "extensionDetails", "extensionEnable", "extensionActivate", "extensionDeactivate", "extensionUninstall", "extensionCommandSelect", "extensionCommandArgs", "extensionRunCommand", "extensionContributions", "extensionOutput"]) assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing from Extensions`);
  for (const capability of ["extensionList", "extensionInstall", "extensionUninstall", "extensionEnable", "extensionActivate", "extensionDeactivate", "extensionCommand", "onExtensionEvent", "registerRuntimeExtensionContributions"]) assert.match(renderer + bridge, new RegExp(capability), `${capability} is not wired through the workbench`);
  assert.match(service, /fork\(this\.hostFile/, "extensions must execute outside the Electron main process");
  assert.match(service, /explicit approval/, "extension mutations must require approval");
  assert.match(host, /uncaughtException|unhandledRejection/, "extension host crashes must be contained and reported");
});

test("command center is keyboard navigable and Workspace does not duplicate Explorer", () => {
  const html = read("index.html");
  const renderer = read("control.js");
  const shellSource = read("ui/shell/app-shell.js");
  assert.match(html, /id=["']commandPalette["']/);
  assert.match(html, /role=["']listbox["']/);
  assert.doesNotMatch(html, /data-tab=["']explorer["']/);
  assert.match(renderer, /ArrowDown/);
  assert.match(renderer, /event\.key === ["']F6["']/);
  assert.match(renderer, /moveRovingFocus/);
  assert.match(renderer, /aria-selected/);
  assert.doesNotMatch(shellSource, /\{ id: ["']explorer["']/);
});

test("Phase 10 Workspace Agent satisfies safe multi-file chat orchestration", () => {
  const agent = read("workspace-agent.cjs");
  const bridge = read("preload.cjs") + read("main.cjs");
  for (const capability of ["attachServices", "safeFile", "createProposal", "proposalDiff", "applyProposal", "rollback", "execute", "handleMessage"]) assert.match(agent, new RegExp(`\\b${capability}\\s*\\(`), `${capability} is missing from Workspace Agent`);
  for (const action of ["open", "explain", "propose", "diff", "apply", "rollback", "tests", "failures", "gitDiff", "search", "symbols", "diagnostics", "tasks", "runTask"]) assert.match(agent, new RegExp(`case ["']${action}["']`), `${action} action is missing`);
  for (const service of ["editor", "terminal", "git", "language", "debug", "tests"]) assert.match(bridge, new RegExp(`${service}: ${service === "tests" ? "testService" : `${service}Service`}`), `${service} is not connected to chat orchestration`);
  assert.match(agent, /requires explicit approval/, "agent edits and rollback must be approval gated");
  assert.match(agent, /changed after proposal creation/, "agent must detect edits made after proposal creation");
  assert.match(agent, /has newer edits/, "rollback must preserve newer creator edits");
  assert.match(bridge, /workspace-agent-action/, "structured Workspace Agent actions must cross the trusted bridge");
});

test("compact workbench releases the auxiliary column and opens chat as an overlay", () => {
  const renderer = read("control.js");
  const css = read("control-ide.css");
  const main = read("main.cjs");
  assert.match(renderer, /AUX_COMPACT_BREAKPOINT\s*=\s*1400/);
  assert.match(renderer, /compact\s*\?\s*["']0px["']\s*:\s*`\$\{layoutState\.auxWidth\}px`/);
  assert.match(renderer, /aux-overlay-open/);
  assert.match(renderer, /addEventListener\(["']resize["'],\s*syncResponsiveWorkbench\)/);
  assert.match(css, /@media\s*\(max-width:\s*1400px\)[\s\S]*grid-template-columns:\s*48px\s+minmax\(180px,\s*var\(--sidebar-width\)\)\s+minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(css, /grid-template-columns:\s*48px\s+var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)\s+0px/, "compact mode must not retain the legacy zero-width auxiliary track");
  assert.match(css, /aux-overlay-open:not\(\.aux-collapsed\)\s+\.auxiliary-bar/);
  assert.match(css, /@media\s*\(max-width:\s*1400px\)[\s\S]*header,[\s\S]*\.workbench-status\s*\{\s*grid-column:\s*1\s*\/\s*-1/, "compact header and status must not create implicit columns");
  assert.match(main, /BLUE_CONTROL_SMOKE_WIDTH/);
  assert.match(main, /BLUE_CONTROL_SMOKE_HEIGHT/);
});

test("control shell has keyboard-operable tabs and complete sidebar routes", () => {
  const html = read("index.html");
  const renderer = read("control.js");
  assert.doesNotMatch(html, /\u00c3.|\u00e2.|\ufffd/, "control shell contains mojibake");
  assert.match(html, /id=["']auxClose["'][^>]*aria-label=["']Close Blue Chat["']/);
  assert.match(renderer, /event\.key\s*===\s*["']Delete["'][\s\S]*editor\.closable/, "closable editor tabs must support the Delete key");
  assert.match(renderer, /["']ArrowLeft["'][\s\S]*["']ArrowRight["'][\s\S]*["']Home["'][\s\S]*["']End["']/, "editor tabs need standard arrow-key navigation");
  for (const route of ["presence rules", "developer tools", "active tasks", "discord-logs", "conflicts", "capability packs", "vrms", "favorites"]) {
    assert.match(renderer, new RegExp(`["']${route}["']`), `${route} is missing a sidebar destination`);
  }
});
