# BlueSync

BlueSync stores versioned shared state in SQLite.

Sync scopes:

- memory
- personality
- settings
- routines
- modules
- project status
- documentation
- local agent capabilities
- Constitution

BlueSync does not blindly overwrite records. Each shared record has a version number and timestamp. If one node writes from an old version after another node already updated the same record, BlueSync creates a conflict instead of overwriting.

Sensitive overwrites require approval before they are applied.