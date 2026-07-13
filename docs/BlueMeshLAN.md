# BlueMesh LAN / Wi-Fi Sync

BlueMesh LAN sync lets two trusted Project Blue installs exchange shared Blue memory/state over the same Wi-Fi/LAN. Blue remains one shared identity replicated across creator PCs.

## What it does now

- Exports signed BlueMesh sync bundles from one SQLite database.
- Imports signed bundles into another SQLite database.
- Runs a small local HTTP bridge for LAN/Wi-Fi push sync.
- Requires a session-only pairing token.
- Rejects bundles signed with the wrong token.
- Requires explicit import approval.
- Creates conflicts instead of blindly overwriting same-version different edits.
- Mirrors imported records into trusted node caches.

## What it does not do yet

- It does not open firewall rules automatically.
- It does not discover Qwen's PC automatically.
- It does not run as a background Windows service yet.
- It does not use a cloud relay yet.
- It does not store the pairing token.

## Quick setup

### 1. Generate a pairing token

On one PC:

```powershell
.\tools\bluemesh\MAKE_BLUEMESH_PAIRING_TOKEN.ps1
```

Copy the token to the other trusted creator privately. Do not commit or paste it into public places.

### 2. Start receiver bridge

On the receiving PC:

```powershell
.\tools\bluemesh\START_BLUEMESH_LAN_SERVER.ps1 -Token "PASTE_TOKEN" -NodeId "qwen_pc" -CreatorId "creator_qwen" -ApproveImports
```

If Windows asks, allow access only on your private/trusted network.

### 3. Push updates to the receiver

On the sending PC:

```powershell
.\tools\bluemesh\PUSH_BLUEMESH_TO_PEER.ps1 -PeerUrl "http://QWEN-PC-IP:8765" -Token "PASTE_TOKEN" -NodeId "adahn_pc"
```

Run it both directions when both PCs have updates.

## Offline fallback

If LAN is blocked, export a signed bundle and send the file manually:

```powershell
.\tools\bluemesh\EXPORT_BLUEMESH_BUNDLE.ps1 -Token "PASTE_TOKEN" -Output ".\bluemesh_bundle.json"
```

On the other PC:

```powershell
.\tools\bluemesh\IMPORT_BLUEMESH_BUNDLE.ps1 -Token "PASTE_TOKEN" -InputPath ".\bluemesh_bundle.json" -Approve
```

## Security rules

- Pairing tokens are session-only.
- Tokens are not written to the database by the transport layer.
- Wrong-token bundles are rejected.
- Same-version different edits create conflict reports.
- Secret path blocking remains handled by BlueSync planning.
- Approval is required before importing bundles.

## Current command module

```powershell
$env:PYTHONPATH = "src"
python -m blue_mesh.lan token
python -m blue_mesh.lan serve --db "Project Blue App/.blue/bluemesh.db" --token "TOKEN" --node-id "qwen_pc" --creator-id "creator_qwen" --approve-imports
python -m blue_mesh.lan push --db "Project Blue App/.blue/bluemesh.db" --token "TOKEN" --node-id "adahn_pc" --peer "http://QWEN-PC-IP:8765"
```
