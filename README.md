# Project Blue

Project Blue is a local-first AI desktop companion and VTuber application.
Blue combines persistent conversation, memory, trusted file learning, a 3D VRM
desktop presence, voice and OCR tools, Discord integration, approvals, audit
records, backups, and a growing control center.

Current release: **Project Blue v3.3 / Desktop Pet v2.3.0**

## Repository map

- `Project Blue App/` - canonical Python and Electron application source
- `Project Blue App/desktop_pet/` - control center and roaming VRM desktop pet
- `Project Blue App/assets/` - Blue's VRM, Blender source, and reference assets
- `Project Blue Data Center/` - architecture, safety, operations, and roadmap
- `START_BLUE.ps1` / `START_BLUE.cmd` - main Project Blue launcher`r`n- `DISABLE_STARTUP.cmd` - removes Blue from Windows Startup`r`n- `START_PROJECT_BLUE_HERE.md` - local launch overview
- `PROJECT_BLUE_BUILD_STATUS_V330_INSTALLED.md` - current verified build status

## Blue Companion platform

The newest organized prototype is `src/blue_companion/`. It maps Blue as a full AI companion platform: desktop avatar movement, one-file-at-a-time file interaction, taskbar-as-floor animation planning, transparent neck drag, AI-to-AI messages through BlueMesh, Discord/stream chat plans, OBS plans, vision/image intake, reference-aware art/model creation, teaching mode, social drafts with approval, schedules, and self-upgrade research planning.

Companion docs live in `docs/companion/`. Current verification lives in `docs/status/BLUE_COMPANION_BUILD_VERIFICATION_20260710.md`.
The local development workspace, runtime databases, secrets, dependency folders,
and historical database backups are intentionally excluded from Git.

## Clone

This repository uses Git LFS for the VRM, Blender, and original avatar archive.

```powershell
git lfs install
git clone https://github.com/blueeyespark/AI-VTUBER.git
cd AI-VTUBER
git lfs pull
```

## Install dependencies

Python 3 and Node.js are required.

```powershell
cd "Project Blue App"
python -m pip install -e .

cd desktop_pet
npm ci
```

## Run Blue

From the repository root:

```powershell
.\START_BLUE.ps1
```

Or run the core application directly:

```powershell
cd "Project Blue App"
.\run_blue.ps1
```

## Launcher cleanup

Use `START_BLUE.ps1` or `START_BLUE.cmd` from the repository root. Older root launchers were preserved under `tools/launchers/legacy_root_launchers/` so the root folder stays readable. App-internal command launchers remain inside `Project Blue App/`.
## VTuber models

Blue's main avatar assets live in:

- `Project Blue App/assets/`
- `Project Blue App/assets/vtuber_models/`
- `Project Blue App/desktop_pet/`

When the desktop app opens, the control center asks which VTuber model to use.
Blue currently supports the built-in 3D VRM model and a built-in 2D portrait
mode. New 2D or 3D VTuber models should be added under
`Project Blue App/assets/vtuber_models/` with a `model.json` manifest. They can
then be selected from the startup picker or the Motion tab.

Planned model features:

- Startup model picker in the control center
- Support multiple saved avatar profiles
- Allow switching between Blue and other VTuber models
- Keep model files, textures, and rig notes grouped together
- Track which model is active in local settings

Voice support starts with installed Windows/browser voices, Listen Once, and
Wake Listen. Wake Listen can be configured with phrases like `hey blue`,
`hay blue`, or any custom wake word. An optional owner phrase lock can reduce
accidental activation, but it is not biometric speaker recognition. True
voiceprint matching and trained/custom voice providers are planned for a later
milestone.

## OpenAI chat

Blue can use OpenAI for generated conversation while keeping runtime secrets out
of Git. Set your API key as an environment variable, then configure OpenAI as
the provider:

```powershell
setx OPENAI_API_KEY "your_api_key_here"
```

Restart your terminal after `setx`, then run:

```powershell
cd "Project Blue App"
.\run_blue.ps1 openai-setup --model gpt-5.5
.\run_blue.ps1 provider-check
.\run_blue.ps1 chat "Hello Blue"
```

Blue reads `OPENAI_API_KEY` from the environment. Do not paste API keys into
chat, screenshots, source files, `.blue` runtime data, or Git commits.

## Local Ollama setup

On first run, the desktop app asks whether the user wants to download Ollama for
local AI thinking. Choosing Download opens the official Windows page:

```text
https://ollama.com/download/windows
```

Ollama is optional. If it is installed and a local model is available, Blue can
prefer that local model before OpenAI.

## Safety and privacy

Blue is designed around local storage, explicit approvals, provenance, bounded
automation, and auditable actions. Never commit `.blue` runtime state, Discord
tokens, credentials, private databases, or backup archives.

See `Project Blue Data Center/04_SECURITY_GOVERNANCE/` for the security model
and project boundaries.

## Development status

The current movement upgrade includes acceleration, curved turns, arrival
braking, speed-driven procedural gait, foot-contact approximation, torso
counter-motion, and bounded secondary hair/tail movement. Planned Blender and
runtime animation work is recorded in
`BLUE_ANIMATION_MOVEMENT_FUTURE_IMPROVEMENTS_V330.md`.

## Direction

Project Blue is moving toward a full AI companion that can chat with the user,
help moderate Discord, help moderate Twitch, and use OpenAI for natural language
conversation and future voice interaction.

Planned assistant features:

- OpenAI-powered chat and reasoning
- Discord moderation with clear permissions and audit records
- Twitch chat moderation and stream companion behavior
- Local memory for ongoing conversations
- A learning queue for requests like "hey qwen, learn how to..." that stores
  topics and notes before any feature is built into code
- Local-first thinking through installed Ollama models, with configurable RAM
  budget, context size, and GPU layer settings to reduce OpenAI use
- Approval gates before sensitive or destructive actions
- Voice conversation in a later milestone

Learning requests are not treated as instant authority. Blue saves the topic,
can run an online starter research pass to collect sources and summaries, tests
what it can, and only then drafts code changes through the normal review, test,
and approval workflow.
