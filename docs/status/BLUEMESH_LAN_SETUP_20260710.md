# BlueMesh LAN Setup - 2026-07-10

State: installed and locally verified.

## Built

- `src/blue_mesh/relay/transport.py`
  - signed sync bundles
  - HMAC pairing-token verification
  - import/export between separate BlueMesh databases
  - conflict-safe imports
  - approved trusted-node cache mirroring
- `src/blue_mesh/lan.py`
  - `token`
  - `serve`
  - `push`
  - `export`
  - `import`
- `tools/bluemesh/`
  - `MAKE_BLUEMESH_PAIRING_TOKEN.ps1`
  - `START_BLUEMESH_LAN_SERVER.ps1`
  - `PUSH_BLUEMESH_TO_PEER.ps1`
  - `EXPORT_BLUEMESH_BUNDLE.ps1`
  - `IMPORT_BLUEMESH_BUNDLE.ps1`
  - setup README
- `docs/BlueMeshLAN.md`
- `tests/test_blue_mesh_lan.py`

## Verified

- BlueMesh LAN tests passed: 4/4.
- BlueMesh combined tests passed: 11/11.
- PowerShell tool scripts parse check passed.
- CLI smoke test passed:
  - DB A exported a signed bundle.
  - DB B imported the bundle with approval.
  - DB B read the synced memory.
- Existing root tests remained green during this setup.

## Security boundary

- Pairing token is required and session-only.
- Wrong token rejects the bundle.
- Imports require approval.
- Conflicting same-version edits generate conflicts instead of overwrite.
- No firewall changes are made automatically.
- No internet/cloud relay is active yet.

## Next steps

1. Run the server script on Qwen's PC or your PC.
2. Push to `http://PEER-IP:8765` from the other PC.
3. Run push both directions if both PCs changed Blue.
4. Add UI controls in Blue's control center for pairing, peer status, last sync, and conflict review.
5. Later add internet relay mode for remote sync outside the shared Wi-Fi.
