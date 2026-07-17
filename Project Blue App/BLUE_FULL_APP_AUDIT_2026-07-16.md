# Project Blue Full-App Audit — 2026-07-16

## Repairs completed

- Fixed a critical exported-ZIP workspace-root bug. The Electron app previously resolved the workspace to the parent folder of the export, which could expose unrelated Downloads files to Explorer, search, Git, editor, terminal, and Workspace Agent services.
- Added `project-paths.cjs` with marker-based project-root discovery and support for both the exported layout and the older nested `Project Blue App/desktop_pet` layout.
- Updated built-in terminal tasks to use the real desktop working directory in either layout instead of a hard-coded legacy path.
- Added root-resolution regression tests.
- Pinned Electron, Three.js, and three-vrm versions so future installs do not silently pull incompatible releases.
- Overrode the incorrectly shipped vulnerable `gh-pages` transitive dependency used by `pixi-live2d-display`; `npm audit` now reports zero vulnerabilities.
- Added `npm run verify` for a single syntax-and-test verification command.
- Added working root launchers: `START_BLUE.ps1` and `START_BLUE.cmd`.
- Fixed tray icon and “Open Blue Folder” paths to use the resolved project root in both supported layouts.
- Expanded Workbench Health to report whether the app is confined to the correct project root.

## Verified

- Node syntax validation passed.
- Node tests: 133 passed, 0 failed.
- Python tests: 94 passed, 1 skipped (Windows-only DPAPI test).
- npm audit: 0 vulnerabilities.

## Remaining limitations and priorities

1. **Windows runtime verification** — Electron rendering, DPAPI, Windows Security, OBS, Discord, native PTY, tray, and multi-monitor behavior still require a real Windows smoke test.
2. **UI modularization debt** — 62 files under `desktop_pet/ui/` remain explicit scaffolds. The active workbench still primarily lives in `index.html`, `control.js`, `control.css`, and `control-ide.css`. Keep the health warning truthful until each module is genuinely migrated.
3. **Large core files** — `main.cjs` and `control.js` are very large and should be split gradually by service, with tests after each extraction. Do not perform another broad rewrite.
4. **Native terminal packaging** — `node-pty` must be rebuilt/bundled for the exact Windows Electron ABI. Run `npm run test:terminal` on the target PC.
5. **Live integration tests** — OBS, Discord, Ollama/OpenAI, BlueMesh LAN, and phone companion paths need opt-in integration tests using test accounts and no real secrets in logs.
6. **Installer** — A repeatable Windows installer should package Electron and native dependencies rather than requiring `npm install` for ordinary users.

## Recommended next engineering milestone

Create a Windows preflight command that runs: project-root validation, native terminal smoke, Electron launch smoke, DPAPI vault test, Windows Security snapshot, model provider check, OBS/Discord connection checks, and a UI screenshot audit. Keep every external connection opt-in and redact credentials.
