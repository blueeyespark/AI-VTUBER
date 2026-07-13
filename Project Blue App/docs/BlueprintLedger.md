# BlueLedger

BlueLedger is the append-only audit trail for BlueMesh.

Every important change records:

- `change_id`
- timestamp
- `node_id`
- `creator_id`
- change type
- affected module
- before state
- after state
- approval status
- previous ledger hash
- current ledger hash

SQLite triggers block updates and deletes on the ledger table. The Python ledger verifier recomputes the hash chain to detect tampering.