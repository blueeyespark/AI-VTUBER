# Project Blue V8 Acceptance Matrix

Date: 2026-07-16

This report distinguishes installed, tested capability from architectural foundations and long-term product work. A roadmap heading is not counted as complete merely because a file or button exists.

## Verified installed capability

| V8 area | State | Installed evidence |
|---|---|---|
| Professional IDE workbench | Working foundation | Permanent IDE shell, workspace explorer, editor tabs, command center, diagnostics/output surfaces, persistent layout state, and existing workbench tests. |
| Project Consciousness | Working foundation | Semantic file/symbol/asset graph, imports, architecture hotspots, Git timeline, contributor ownership, coverage artifact discovery, and goal/milestone/risk/debt signals. |
| Blue Brain | Working foundation | Persistent typed memory, goals, decisions, relationships, habits, provenance/confidence, secret filtering, and approval gates for identity and persistent planning data. |
| Living AI companion | Working foundation | Desktop VRM presence, chat, persistent memory, proactive/background work surfaces, voice controls, movement system, and explicit permissions. |
| Knowledge Graph | Working foundation | Files, assets, classes, functions, tests, document sections, dependencies, creator-supplied knowledge, search, neighborhoods, critical-node ranking, and impact explanations. |
| Semantic Timeline / Time Machine | Working foundation | Searchable project events and Git history; reconstruction returns a high-risk approval plan and never silently rewrites Git. |
| Background agents | Working scheduled foundation | Ten read-only agents covering documentation, security, performance, architecture, research inventory, dependency cycles, cleanup, tests, assets, and indexing. An opt-in persistent scheduler runs approved intervals, resumes after restart, records bounded history, deduplicates unchanged findings, and keeps every code change separately approval-gated. |
| AI software architect | Working foundation | Dependency graph, circular-dependency detection, hotspots, impact analysis, module-size warnings, and reviewed refactor proposals. |
| AI security engineer | Working foundation | Secret-pattern redaction/detection, unsafe shell-construction warnings, Windows security status, permission gates, and read-only reports. |
| AI performance engineer | Working foundation | Oversized source/asset and parse-pressure findings, OBS/streaming preflight, and a bounded Node runtime profiler for CPU, heap/RSS, event-loop utilization, system memory, indexed-knowledge size, and local history. GPU and native-child profiling remain future work. |
| AI research engine | Working foundation | Bounded project-linked research inventory, research task/idea flows, citation/source structures, and creator-approved web research workflow. Automatic unattended browsing is intentionally not enabled. |
| Creator OS | Partial platform | Chat, ideas, research, project work, image/reference intake, avatar/VRM, voice, streaming/OBS, Discord, schedules/plans, and artifact management exist. Native production-grade 3D/video/audio authoring engines are not complete. |
| BlueMesh collaboration | Working local/LAN prototype | One identity, trusted nodes, roles, append-only ledger, signed bundle exchange, approval-gated import, conflicts, LAN pairing, offline resync, and Git update workflow. Production relay and encryption-at-rest remain future work. |
| Desktop companion | Working foundation | VRM desktop avatar, multi-window presence, OBS visibility, movement/expression controls, chat access, startup controls, and permission-gated PC assistance. |
| Workspace awareness | Working foundation | Workspace index, Git/project history, semantic graph, recent activity, open workbench state, memory, health signals, and chat commands. |
| Extension platform | Working foundation | Extension service/registry and modular service boundaries exist. Signed public marketplace distribution and third-party SDK hardening remain future work. |
| Workspace health score | Working | Architecture, documentation, security, performance, testing, measured/fallback coverage, dependencies, technical debt, memory, and stability categories with explainable issues. |
| Time Machine | Safe foundation | Timeline search and reconstruction planning exist; actual restore stays behind explicit review, checkpoint, backup, and Git approval. |
| Explainability | Working | Actions include why, evidence, files, risk, approval, undo, verification, and confidence; evidence and paths are bounded. |
| Future-proof architecture | Working foundation | Services are separated behind CommonJS interfaces and trusted IPC/preload bridges; state is persisted outside renderer UI. Some legacy large files still require gradual decomposition. |

## Deliberately not claimed complete

- Production cloud BlueMesh relay, transport encryption, and encrypted-at-rest shared data.
- A signed public extension marketplace and stable third-party SDK.
- Native production-grade 3D modeling, video editing, audio production, and image-generation engines independent of external runtimes.
- Semantic parsing as precise as a full language server for every supported language.
- Always-on autonomous internet research without creator approval.
- GPU and native-child runtime profiling comparable to dedicated profilers.
- Guaranteed ownership inference when a workspace has no Git history.

## Verification contract

The V8 implementation is accepted only when:

1. `npm run check` passes.
2. `npm run check:v8` passes.
3. The complete desktop test suite passes.
4. `git diff --check` passes.
5. No `.env`, token, credential, or private key is added.
6. No Blue source or temporary working directory remains in the Minecraft Butchery project.
