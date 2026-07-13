# BlueMesh

BlueMesh is Project Blue's built-in collaboration system. It lets two or more trusted creator PCs run Blue locally while keeping Blue as one shared identity.

Core rule:

> Blue may have many devices, but only one identity.

## Architecture

- GitHub handles code history.
- BlueMesh handles shared identity, memory, settings, modules, project state, and sync events.
- Local Blue agents handle PC-specific actions.
- SQLite is the first local database.
- PostgreSQL or a cloud database can be added later by replacing the database adapter, not the sync rules.

## First prototype

The first prototype lives in `src/blue_mesh` and can:

- create one shared Blue identity;
- register two local nodes;
- record trusted devices and creators;
- write ledger entries;
- sync a test memory;
- detect a stale-version conflict;
- generate a conflict report.

Run it from `Project Blue App`:

```powershell
$env:PYTHONPATH="src"
python -m blue_mesh.prototype --db .blue/blue_mesh.db
```

## Security boundaries

- Tokens are never printed or intentionally stored.
- `.env` files are rejected from sync.
- Git internals are rejected from sync.
- Sensitive overwrites require approval.
- Constitution and identity changes require approval.
- Encryption is marked as a later milestone.