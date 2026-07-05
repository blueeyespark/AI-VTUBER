# Project Blue Research and Capability Map — v2.2

Date: 2026-07-03  
Scope: permanent Project Blue data center, executable core, desktop pet,
control panel, tests, source references, and roadmap.

## Inventory result

The executable project contains 233 Python function definitions, 16 Python
classes, 107 CLI commands, and 25 Electron IPC handlers. The data center
contains 29 structured Markdown documents plus the preserved foundation DOCX,
18 original design screenshots, the VRM, Blender sources, movement videos,
versioned databases, checksums, and release records.

Implemented foundations:

- identity, Constitution, policy, audit, memory, sources, citations, search;
- projects, tasks, workspaces, roles, approvals, quorum, receipts;
- signed proposals, atomic changes, rollback, Forge artifacts and runners;
- Academy answers, lessons, assessments, and review submissions;
- backups, checksums, restore drills, release signatures, and DPAPI vault;
- persistent local conversation with optional Ollama;
- file, folder, image, link, clipboard, and text sharing;
- voice, VRM body, roaming movement, expressions, OBS window capture, startup;
- v2.2 Laboratory records and versioned module/research catalogs.

Partially implemented:

- Forge is safe and provenance-aware but has a small template catalog.
- Academy is citation-backed but does not yet maintain learner profiles.
- Presence covers one Windows desktop host, voice synthesis, and OBS capture.
- Enterprise currently covers projects and tasks, not calendars or inventory.
- Memory retrieval is lexical FTS; semantic embeddings remain optional research.

Intentionally deferred:

- financial transactions, autonomous publishing, broad desktop automation;
- multi-host synchronization, remote control, phone clients;
- physical robotics, hardware maintenance, and exploration;
- constitutional self-modification or unreviewed self-training.

## Research conclusions

### AI risk, evaluation, and secure development

Blue should maintain a release-specific risk register, measurable evaluations,
incident records, and human review rather than relying only on constitutional
text. NIST organizes AI risk work around lifecycle governance and measurement,
while SP 800-218A extends secure development practices to AI systems.

Sources:

- https://www.nist.gov/itl/ai-risk-management-framework
- https://csrc.nist.gov/pubs/sp/800/218/a/final

### Memory, retrieval, and learning

Retrieval-augmented generation supports Blue's existing design decision to keep
memory outside model weights. Retrieval should remain attributable, bounded,
correctable, and visibly separated from model-generated conclusions. SQLite
FTS5 is appropriate for the current local scale. Semantic embeddings can be an
optional second-stage ranker after a local embedding model is explicitly
installed; they must not replace exact source identity or citations.

Sources:

- https://arxiv.org/abs/2005.11401
- https://www.sqlite.org/fts5.html
- https://github.com/ollama/ollama/blob/main/docs/api.md

### Tool and module architecture

Blue's Genome should use typed, discoverable contracts. MCP's separation of
read-only resources, callable tools, and user-invoked prompts maps well to
Blue's module design. Tool execution still needs Blue's own policy, approval,
scope, expiry, audit, and rollback controls; protocol compatibility is not
authorization.

Sources:

- https://modelcontextprotocol.io/docs/learn/architecture
- https://modelcontextprotocol.io/docs/learn/server-concepts
- https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices

### Desktop and Presence security

Electron recommends context isolation, process sandboxing, narrow preload APIs,
restricted navigation, sender validation, a restrictive content security
policy, and current dependencies. Blue already uses local content,
`nodeIntegration: false`, context isolation, and narrow methods. Next hardening
should explicitly enable the sandbox, validate IPC senders, restrict
navigation/window creation, and add a CSP that accommodates the local import map.

Source:

- https://www.electronjs.org/docs/latest/tutorial/security

### OBS and creator presence

OBS 28 and later include obs-websocket. A future Blue OBS adapter should start
read-only, authenticate, expose connection status and current scene, and
require explicit approval before changing scenes, starting streams, or
recording. Window Capture remains the lowest-risk current integration.

Sources:

- https://github.com/obsproject/obs-websocket
- https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md

### Voice and accessibility

Speech synthesis and recognition have distinct consent and privacy
implications. Blue currently uses local speech synthesis only. Microphone
listening should remain visibly indicated, push-to-talk by default, and off
until explicitly enabled. The control panel should continue toward WCAG 2.2:
keyboard access, visible focus, labels, status announcements, sufficient
targets, reduced-motion support, and no interaction that requires dragging.

Sources:

- https://dvcs.w3.org/hg/speech-api/raw-file/tip/webspeechapi
- https://www.w3.org/TR/WCAG22/

### Continuity and software supply chain

SQLite's online backup mechanism matches Blue's live database backup approach.
Release provenance should progress from Blue's signed file manifest toward a
standard SBOM and verifiable build/source provenance. SPDX 3 describes software,
AI, data, licensing, and integrity metadata; SLSA describes incremental
supply-chain guarantees.

Sources:

- https://www.sqlite.org/backup.html
- https://spdx.dev/use/specifications/
- https://slsa.dev/spec/v1.2/

### Multi-host networking

Being on a local network must not imply trust. Every future host needs identity,
authentication, authorization, revocation, and resource-scoped policy. Offline
concurrent edits require a deliberate conflict model; local-first/CRDT designs
are promising but cannot automatically preserve high-level invariants such as
approval quorum or financial balances.

Sources:

- https://csrc.nist.gov/pubs/sp/800/207/final
- https://www.inkandswitch.com/local-first/static/local-first.pdf

### Enterprise and scheduling

Portable calendar interchange should use iCalendar rather than inventing a
private event format. Initial calendar support should import/export local
`VEVENT` and `VTODO` data before connecting accounts or sending invitations.

Source:

- https://www.rfc-editor.org/info/rfc5545/

### Robotics

Physical robotics remains research-only. ROS 2 provides managed node lifecycles
and DDS-backed authentication, encryption, integrity, and access control.
Blue's first robotics work should therefore be a simulator adapter with
inactive/configured/active/error states, bounded commands, telemetry,
watchdogs, and emergency stop—not direct unsupervised hardware motion.

Sources:

- https://docs.ros.org/en/rolling/Concepts/Intermediate/About-Security.html
- https://docs.ros.org/en/jazzy/Tutorials/Demos/Managed-Nodes.html

## Prioritized implementation path

### Built in v2.2

1. A versioned Blue Genome module registry with explicit status and risk.
2. A primary-source research catalog embedded in the application.
3. Blue Laboratory records separating ideas, hypotheses, experiments, and
   findings.
4. Confidence, assumptions, provenance, evidence links, search, audit, and
   export for Laboratory records.
5. Control-panel access to Idea Lab, Capability Map, and Research Sources.

### Recommended next

1. Electron hardening: sender checks, navigation limits, explicit sandbox, CSP.
2. Research dossiers: claims, methods, opposing evidence, and reproducibility.
3. Local model evaluation harness for groundedness, citations, refusal, latency,
   and memory leakage.
4. SPDX dependency inventory and stronger release provenance.
5. Read-only authenticated OBS status adapter.
6. WCAG keyboard/focus/status and reduced-motion pass.
7. Optional local embedding reranker after explicit model installation.
8. Local iCalendar import/export.

### Deferred gates

- Network requires host identity, revocation, secure transport, conflict tests,
  and recovery exercises.
- Finance requires a written accounting model, separation of duties, limits,
  reconciliation, professional review, and no autonomous transaction execution.
- Robotics requires simulation evidence, lifecycle control, physical safety
  analysis, a hardware emergency stop, and direct human supervision.

## Decision

Blue should deepen the trusted local platform before expanding authority.
Capability should grow through small typed modules, evidence, tests, approvals,
and rollback—not through a global autonomy switch.
