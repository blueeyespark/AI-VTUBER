# BlueSync

BlueSync handles versioned shared state for memory, personality, settings, routines, modules, project status, documentation, local agent capabilities, and Constitution-adjacent records.

Rules:

- No blind overwrites.
- Every shared record has a version and timestamp.
- Stale writes create conflicts.
- Memory, Constitution, personality, and settings overwrites require explicit approval.
- `.env`, key/cert files, token folders, secret folders, and credential paths are rejected from sync planning.
