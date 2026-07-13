# BlueMesh

BlueMesh is Project Blue's built-in collaboration layer. Its rule is simple: Blue may have many devices, but only one identity.

## Architecture

- GitHub remains the source of truth for code history.
- BlueMesh stores shared identity, memory, settings, project state, modules, and sync decisions in SQLite first.
- Each creator PC runs a local BlueNode with PC-specific capabilities.
- LAN/Wi-Fi sync is planned through trusted peer records and pairing codes.
- Internet relay sync is approval-gated and must not store tokens in BlueMesh.
- The storage boundary is small so PostgreSQL or a cloud database can replace SQLite later.

## Prototype status

The first prototype can:

1. Create a shared Blue identity.
2. Register two local nodes.
3. Add trusted device records.
4. Write changes to the append-only ledger.
5. Sync a test memory from Node A to Node B.
6. Detect a stale edit conflict.
7. Generate a Markdown conflict report.

Run it with:

```powershell
$env:PYTHONPATH = "src"
python -m blue_mesh --db ".blue/bluemesh.db" --reports "docs/conflict_reports"
```

## Trusted-node update mirroring

Approved shared-state writes now mirror into every trusted node cache. In local verification this proves the expected behavior:

1. Node A writes an approved shared memory.
2. Node B receives the same record/version in its node cache.
3. Node B writes an approved update.
4. Node A receives the newer record/version in its node cache.
5. If either node edits from a stale version, BlueMesh creates a conflict instead of blindly overwriting data.

This is the local-first sync core. Real LAN/Wi-Fi or internet relay transport still needs connector wiring, pairing, and token-safe deployment, but the database and conflict logic now prove the update propagation rule.
## BlueMesh LAN / Wi-Fi transport

LAN transport is now installed as a signed, pairing-token-protected prototype. See docs/BlueMeshLAN.md and 	ools/bluemesh/README.md. It supports token generation, serve, push, export, and import. It verifies separate database sync and conflict-safe imports, but does not open firewall rules or provide cloud relay automatically.
