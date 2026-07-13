# BlueLedger

BlueLedger is an append-only SQLite log of important BlueMesh changes.

Each entry records:

- `change_id`
- `timestamp`
- `node_id`
- `creator_id`
- `change_type`
- `affected_module`
- `record_key`
- `before_state`
- `after_state`
- `approval_status`

SQLite triggers block updates and deletes, so tampering attempts fail instead of silently changing history.
