# Project Blue

Project Blue is a local-first AI desktop companion and VTuber application.
Blue combines persistent conversation, memory, trusted file learning, a 3D VRM
desktop presence, voice and OCR tools, Discord integration, approvals, audit
records, backups, and a growing control center.

Current release: **Project Blue v3.3 / Desktop Pet v2.3.0**

## Repository map

- `Project Blue App/` — canonical Python and Electron application source
- `Project Blue App/desktop_pet/` — control center and roaming VRM desktop pet
- `Project Blue App/assets/` — Blue's VRM, Blender source, and reference assets
- `Project Blue Data Center/` — architecture, safety, operations, and roadmap
- `START_PROJECT_BLUE_HERE.md` — local launch overview
- `PROJECT_BLUE_BUILD_STATUS_V330_INSTALLED.md` — current verified build status

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
.\open_blue.ps1
```

Or run the core application directly:

```powershell
cd "Project Blue App"
.\run_blue.ps1
```

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
