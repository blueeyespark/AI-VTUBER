# Project Blue — v2.2 Laboratory and Genome Milestone

This is the first executable Project Blue foundation. It implements:

- a stable Blue identity and versioned Constitution;
- local SQLite memory with ownership, provenance, sensitivity, and retention fields;
- tamper-evident, hash-chained audit events;
- a policy gate for blocked and approval-required actions;
- an offline provider that works without accounts or paid services;
- an optional local Ollama provider;
- ranked retrieval across memories, sources, projects, tasks, and indexed files;
- recent-turn conversation context for connected local language models;
- useful grounded responses when no generative model is installed;
- optional OpenAI provider support through `OPENAI_API_KEY`;
- diagnostics, export, and backup commands;
- persistent projects and tasks;
- accountable approval-request and decision records;
- optional conversation history, disabled by default;
- checksum-verified SQLite backups;
- an interactive local shell;
- a token-protected dashboard bound only to localhost;
- unified search across memories, projects, and tasks;
- validated JSON memory import and memory editing;
- local model-provider health checks;
- stored source documents with SHA-256 identity;
- citations linking memories to evidence;
- named, persistent conversation workspaces;
- approval execution receipts;
- SQLite FTS5 indexed search with a compatibility fallback;
- registered read-only project workspaces;
- bounded UTF-8 file indexing with ignored sensitive/build directories;
- unified diffs and approval-linked file proposals;
- race-safe, atomic application of explicitly approved changes;
- isolated restore drills for verified backups;
- per-workspace indexing and proposal policies;
- proposal rejection, expiry, and freshness checks;
- approval-gated rollback with post-apply hash verification;
- dashboard diff review with explicit approve/deny controls;
- role-scoped workspace access for viewers, proposers, and maintainers;
- expiring approval records;
- HMAC-SHA256 signed proposal bundles;
- recurring backup-verification cadence and recorded results;
- dashboard rollback request and execution controls;
- password-authenticated principals using `scrypt`;
- multi-principal approval quorum;
- Windows DPAPI-protected secret storage;
- HMAC-signed release manifests with installed-file verification;
- first-run identity and backup onboarding;
- provenance-tracked Forge artifacts;
- approval-gated project templates;
- allowlisted Python compile and unittest runners;
- bounded runner output and 60-second timeout;
- citation-backed Academy evidence answers;
- approval-reviewed and HMAC-signed Forge releases;
- per-workspace runner enable/disable policy;
- HMAC-attested runner results with tamper verification;
- citation-backed Academy lesson generation;
- multi-file Forge bundles with linked artifacts and separate approvals;
- source-grounded Academy assessments and unscored review submissions;
- a standard-library test suite.

This release is intentionally a small trusted core—not autonomous desktop control.

## Activate Blue

Start or resume a persistent session:

```powershell
.\run_blue.cmd activate --session "My Blue Session"
```

Ordinary text talks to Blue. `/learn PATH | TITLE` imports a creator-selected
source with provenance, `/lesson TOPIC` creates a cited lesson,
`/academy QUESTION` retrieves stored evidence, and
`/make WORKSPACE | TEMPLATE | RELATIVE_PATH` prepares an approval-gated Forge
proposal. Use `/help` inside the session for the complete command list.

Offline foundation mode can retrieve related memory and explain its status.
Generated natural-language conversation requires an explicitly configured
local Ollama model; Blue never downloads or activates one silently.

## Make Blue appear on the desktop

From the repository root:

```powershell
.\START_BLUE.cmd
```

The desktop/control-center companion uses Blue's real persistent conversation database. It
provides visible chat, a trusted-file learning picker, cited Academy commands,
and approval-gated `/make` proposals.

The same root launcher opens the current full desktop/control-center experience:

```powershell
.\START_BLUE.ps1
```

The 3D body is a transparent, frameless, always-on-top Electron window using
Three.js and the official VRM loader. It supports idle movement, blinking,
expressions, click interaction and a persistent bond counter, plus chat and
trusted-file learning connected to Blue's real local database.

Version 1.6 separates the roaming body from a resizable, minimizable control
panel. The pet can move across the virtual multi-monitor desktop, pause while
the pointer is over it, and remain available through a system-tray menu. The
control panel includes chat, file/image/folder/link sharing, Blue Doctor,
project-folder access, wandering controls, and OBS Window Capture guidance.

Version 1.7 adds procedural walking and idle animation, stable root-level hair
and tail sway, a paste-and-drop sharing surface, clipboard support, free local
speech synthesis with installed Windows voices, PC/display diagnostics, and a
more capable control panel.

Version 1.8 adds a layered animation state machine based on the supplied video
references: locomotion with weight shift and counter-rotation, timed rests,
look/lean/wave behaviors, screen-edge reactions, pointer-aware head movement,
smooth anticipation/follow-through envelopes, and expression synchronization.

Version 2.0 adds continuous locomotion blending, velocity-driven gait and
facing, damped secondary-motion springs, speech lip synchronization, explicit
gesture controls, safer native window movement, and expanded movement research.

Version 2.1 adds ranked cross-record retrieval, persistent dialogue context for
local-model prompts, useful grounded offline replies, image dimensions and
SHA-256 provenance, conversation-history controls, and an explicit one-click
connection to an already-installed local Ollama model. Blue never downloads or
purchases a model silently.

Version 2.2 adds a versioned Blue Genome capability registry, an embedded
primary-source research catalog, and Blue Laboratory. Laboratory records keep
ideas, hypotheses, experiments, and findings distinct and preserve confidence,
assumptions, provenance, linked evidence, search records, exports, and audit
history. The control panel can capture ideas and display the capability and
research maps. Electron renderer sandboxing is now explicit and child-window
creation is denied.

## Quick start

From this directory:

```powershell
.\run_blue.cmd init
.\run_blue.cmd status
.\run_blue.cmd remember "Creator preference" "Blue should explain important decisions."
.\run_blue.cmd recall "decisions"
.\run_blue.cmd chat "What can you do right now?"
.\run_blue.cmd shell
.\run_blue.cmd dashboard
.\run_blue.cmd doctor
```

Blue stores runtime data in `.blue` beside the application unless `--home` or
`PROJECT_BLUE_HOME` specifies another location.

## Local dashboard

```powershell
.\run_blue.cmd dashboard
```

Blue prints a one-time local login URL. Open that URL in your browser. The
dashboard only accepts loopback bindings, requires a session token, uses CSRF
checks for changes, sends restrictive browser security headers, and does not
load remote scripts or assets.

## Search and memory tools

```powershell
.\run_blue.cmd search "dashboard"
.\run_blue.cmd memory-update MEMORY_ID "Updated title" "Updated information"
.\run_blue.cmd memory-import memories.json
.\run_blue.cmd provider-check
```

## Sources and citations

Blue imports UTF-8 `.txt`, `.md`, `.json`, `.csv`, and `.py` sources up to 2 MB.
It stores their content, original path, media type, and SHA-256 fingerprint.

```powershell
.\run_blue.cmd source-add notes.md --title "Project notes"
.\run_blue.cmd sources
.\run_blue.cmd memory-cite MEMORY_ID SOURCE_ID --locator "Architecture"
.\run_blue.cmd citations --memory MEMORY_ID
```

## Named conversations

Named conversations are explicitly persistent even when general conversation
history is disabled:

```powershell
.\run_blue.cmd conversation-create "Blue architecture"
.\run_blue.cmd conversation-chat "Blue architecture" "Review the portability design."
.\run_blue.cmd conversation-show "Blue architecture"
```

## Approval receipts

After an approved action is performed by a person or future bounded executor,
record the outcome:

```powershell
.\run_blue.cmd approval-receipt APPROVAL_ID succeeded "Published release notes."
.\run_blue.cmd receipts --approval APPROVAL_ID
```

## Guided local-model setup

```powershell
.\run_blue.cmd model-setup --model llama3.2
```

This only configures a model already installed in local Ollama. It never
downloads or activates remote models silently.

## Project workspaces

Registering and indexing a workspace is read-only:

```powershell
.\run_blue.cmd workspace-add "My project" C:\path\to\project
.\run_blue.cmd workspace-index "My project"
.\run_blue.cmd workspace-files "My project"
.\run_blue.cmd search "function name"
```

Blue ignores internal/build directories, symlinks, binary files, unsupported
extensions, files over 500 KB, and content beyond the indexing limits.

Inspect or update a workspace's bounded policy:

```powershell
.\run_blue.cmd workspace-policy "My project"
.\run_blue.cmd workspace-policy-set "My project" --max-file-kb 500 --max-total-mb 20 --allow-new-files false --proposal-hours 168
.\run_blue.cmd workspace-freshness "My project"
```

## Proposed file changes

Blue never edits a registered project merely because it is indexed. A change
starts as a diff linked to a pending approval:

```powershell
.\run_blue.cmd change-propose "My project" src\app.py proposed_app.py
.\run_blue.cmd change-show CHANGE_ID
.\run_blue.cmd approval-decide APPROVAL_ID approved --note "Reviewed diff."
.\run_blue.cmd change-apply CHANGE_ID
```

Before applying, Blue verifies that the target still has the exact hash used to
create the diff. It stores the prior file in `.blue\change_backups`, writes
atomically, and records an execution receipt. Path traversal, symlink escapes,
unsupported files, missing approval, and stale diffs are rejected.

Proposals expire according to workspace policy and may be explicitly rejected:

```powershell
.\run_blue.cmd change-reject CHANGE_ID "Reason for rejection"
```

## Approval-gated rollback

Applied changes can be rolled back only when the file still matches exactly
what Blue applied and a separate rollback approval is granted:

```powershell
.\run_blue.cmd change-rollback-request CHANGE_ID
.\run_blue.cmd approval-decide ROLLBACK_APPROVAL_ID approved --note "Restore reviewed original."
.\run_blue.cmd change-rollback CHANGE_ID
```

The dashboard displays escaped unified diffs with explicit approve and deny
controls. Approval does not apply a change; `change-apply` remains separate.

## Workspace roles

```powershell
.\run_blue.cmd workspace-grant "My project" reviewer viewer
.\run_blue.cmd workspace-grant "My project" developer proposer
.\run_blue.cmd workspace-grant "My project" maintainer maintainer
.\run_blue.cmd workspace-access "My project"
```

Viewers may index and inspect. Proposers may create diffs. Maintainers may apply,
reject, change policy, and rollback. Creator access cannot be revoked.

## Signed proposal bundles

```powershell
.\run_blue.cmd proposal-export CHANGE_ID proposal.json
.\run_blue.cmd proposal-verify proposal.json
```

Bundles are authenticated with a runtime HMAC-SHA256 key preserved inside
Blue's database. Any payload modification invalidates the signature.

## Backup verification maintenance

```powershell
.\run_blue.cmd backup-schedule 24
.\run_blue.cmd maintenance-status
.\run_blue.cmd maintenance-run backups --force
```

Maintenance records the checksum and SQLite-integrity result for every backup.
It does not replace or restore the live database.

## Principals and approval quorum

```powershell
.\run_blue.cmd principal-create alice --display-name "Alice"
.\run_blue.cmd approval-request publish "Publish release" --quorum 2 --hours 24
.\run_blue.cmd approval-vote APPROVAL_ID alice approved
```

Passwords are processed with Python's `scrypt`; only salted password hashes are
stored. Each principal can vote once. A denial closes the approval, while
approval requires the configured number of distinct votes.

## Protected secret vault

```powershell
.\run_blue.cmd vault-set service_token alice
.\run_blue.cmd vault-get service_token alice
.\run_blue.cmd vault-delete service_token alice
```

Secret values and passwords are entered through hidden prompts. Values are
protected with Windows DPAPI and bound to the current Windows user profile.
Readable JSON exports exclude proposal and release signing keys.

## Signed release manifests

```powershell
.\run_blue.cmd release-create . release.json
.\run_blue.cmd release-verify release.json .
```

Verification checks both the HMAC signature and every included file hash.

## First-run onboarding

```powershell
.\run_blue.cmd onboard --identity Blue --backup-hours 24
```

Onboarding initializes the creator principal, local identity, and backup
verification cadence without enabling remote access or broad autonomy.

## Blue Forge artifacts and templates

```powershell
.\run_blue.cmd forge-artifact "Design notes" document design.md --source SOURCE_ID
.\run_blue.cmd forge-template "My project" python_cli main.py
.\run_blue.cmd forge-artifacts
```

Artifacts record content hashes, input paths, Blue version, and linked sources.
Templates create draft artifacts and file-change proposals; they do not write
project files until the normal approval and change-application gates succeed.

Create a connected four-file Python starter:

```powershell
.\run_blue.cmd forge-bundle "My project" python_starter "Helpful Tool"
.\run_blue.cmd forge-bundles
```

The bundle produces `pyproject.toml`, `main.py`, `test_main.py`, and `README.md`.
Each file remains a separate approval-gated proposal. Forge records the four
artifacts as one bundle and links supporting artifacts to the primary artifact.
No registered workspace file is written by bundle creation.

## Bounded build and test runners

```powershell
.\run_blue.cmd run-request "My project" python_compile
.\run_blue.cmd approval-decide APPROVAL_ID approved
.\run_blue.cmd run-execute RUN_ID
```

Only exact built-in command arrays are accepted. Runs use `shell=False`, a
filtered environment, captured output, a 60-second timeout, explicit approval,
and workspace maintainer authority. This is a controlled runner, not an
operating-system security sandbox. `python_unittest` executes project test code
and should only be approved for trusted workspaces.

## Blue Academy

```powershell
.\run_blue.cmd academy-ask "portable identity"
.\run_blue.cmd academy-history
```

Academy answers from stored source excerpts and includes source IDs, titles, and
SHA-256 fingerprints. If no source supports an answer, it says so instead of
inventing one.

## Reviewed Forge releases

```powershell
.\run_blue.cmd forge-release-request ARTIFACT_ID --quorum 1
.\run_blue.cmd approval-decide APPROVAL_ID approved
.\run_blue.cmd forge-release ARTIFACT_ID
.\run_blue.cmd forge-verify ARTIFACT_ID
```

Release signatures cover artifact identity, kind, content hash, provenance, and
approval. Verification separately checks the stored content against its hash.

## Runner policy and attestations

`python_compile` is enabled by default. `python_unittest` is disabled until a
workspace maintainer explicitly enables it:

```powershell
.\run_blue.cmd runner-policy "My project"
.\run_blue.cmd runner-policy-set "My project" python_unittest true
.\run_blue.cmd run-verify RUN_ID
```

Completed runner results carry an HMAC attestation over the command, status,
exit code, and hashes of captured output. Tampering invalidates verification.

## Academy lessons

```powershell
.\run_blue.cmd academy-lesson "portable identity"
.\run_blue.cmd academy-lessons
```

Lessons require matching stored sources and include learning objectives,
evidence excerpts, review questions, source fingerprints, and a lesson-content
hash. Without evidence, lesson creation stops.

## Academy assessments

```powershell
.\run_blue.cmd academy-assessment LESSON_ID
.\run_blue.cmd academy-assessments
.\run_blue.cmd academy-submit ASSESSMENT_ID learner answers.json
.\run_blue.cmd academy-submissions --assessment ASSESSMENT_ID
```

The answers file is a JSON array containing one non-empty string per question.
Assessment questions retain the lesson's source scope. Submissions are marked
`submitted_for_review`; Blue does not invent an automatic score or pretend a
human review occurred.

## Restore drills

```powershell
.\run_blue.cmd restore-drill backups\blue-v0.5.0-initial.db
```

The drill restores into temporary isolation and checks database integrity and
required tables without replacing the live runtime.

## Projects and tasks

```powershell
.\run_blue.cmd project-create "Project Blue" --description "Build Blue responsibly."
.\run_blue.cmd task-add "Project Blue" "Design the local dashboard" --priority high
.\run_blue.cmd projects
.\run_blue.cmd tasks --project "Project Blue"
```

## Approval records

High-impact actions can be proposed and recorded without being silently executed:

```powershell
.\run_blue.cmd approval-request publish "Publish the Phase 1.1 status."
.\run_blue.cmd approvals --status pending
.\run_blue.cmd approval-decide APPROVAL_ID approved --note "Reviewed by creator."
```

## Conversation privacy

Conversation storage is off by default. To opt in:

```powershell
.\run_blue.cmd config save_conversations true
.\run_blue.cmd history
```

Clear opted-in history with `history-clear --confirm`.

## Verified backup

```powershell
.\run_blue.cmd backup backups\blue.db
.\run_blue.cmd verify-backup backups\blue.db
```

## Optional local model

If Ollama is installed and running:

```powershell
.\run_blue.cmd config provider ollama
.\run_blue.cmd config model llama3.2
.\run_blue.cmd chat "Introduce yourself."
```

Blue only calls the local Ollama endpoint at `http://127.0.0.1:11434` by default.

## Optional OpenAI chat

Blue can use OpenAI for generated conversation. The API key is read from the
environment and is not stored in Blue's config:

```powershell
setx OPENAI_API_KEY "your_api_key_here"
```

Restart your terminal after `setx`, then run:

```powershell
.\run_blue.cmd openai-setup --model gpt-5.5
.\run_blue.cmd provider-check
.\run_blue.cmd chat "Introduce yourself."
```

To switch back to offline mode:

```powershell
.\run_blue.cmd config provider offline
```

## Tests

```powershell
python -m unittest discover -s tests -v
```

## Safety status

The Constitution and policy engine are engineering controls, but this early
release is not a complete safety system. Do not grant it administrative,
financial, medical, robotic, or other high-impact authority.
