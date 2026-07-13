# Multi-Creator Workflow

BlueMesh is for creators who want one Blue identity across multiple PCs.

## Normal workflow

1. Each creator runs Project Blue locally.
2. Each PC registers as a BlueNode with a unique `node_id`.
3. A Creator or Co-Creator marks the node as trusted.
4. Memory, settings, modules, project state, and docs sync through BlueMesh.
5. PC-specific abilities stay local and are recorded as node capabilities.

## Same Wi-Fi workflow

When both PCs are on the same LAN/Wi-Fi:

- BlueMesh can use LAN relay events.
- Nodes can sync faster without requiring GitHub for shared memory.
- GitHub still remains the code history source.

## Remote workflow

When PCs are not on the same network:

- GitHub handles code updates.
- A future internet relay can carry shared-state sync messages.
- Offline nodes queue sync events and re-sync later.

## Approval workflow

Sensitive changes require approval:

- Constitution edits
- identity edits
- trusted-device changes
- shared-memory overwrites
- rollback or destructive update actions

This protects Blue from becoming two diverging personalities.