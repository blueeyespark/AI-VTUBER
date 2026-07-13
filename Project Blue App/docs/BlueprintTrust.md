# BlueTrust

BlueTrust defines creator roles and approval requirements.

Roles:

- Creator
- Co-Creator
- Steward
- Contributor
- Viewer

Sensitive changes require approval. This includes Constitution changes, identity edits, trusted-device updates, rollbacks, and overwrites to shared memory or other important shared state.

BlueTrust also blocks unsafe sync paths such as `.env`, Git internals, token paths, and secret paths.