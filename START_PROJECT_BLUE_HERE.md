# Start Project Blue Here

Project Blue now has two working parts:

- `Project Blue Data Center` — the organized source of truth and engineering plan.
- `Project Blue App` — the first executable local core.

## Run Blue

Open a terminal in `Project Blue App`, then run:

```powershell
.\run_blue.cmd status
.\run_blue.cmd chat "What can you do right now?"
.\run_blue.cmd remember "Title" "Information Blue should remember."
.\run_blue.cmd recall "search words"
.\run_blue.cmd doctor
```

The current offline provider supports Blue's identity, Constitution, memory,
policy, auditing, backup, export, and diagnostics. Connect a local Ollama model
later for generated conversation.

## Current boundary

This is a tested Phase 1 foundation. It does not yet control the desktop, publish
content, spend money, access private accounts, or operate hardware.
