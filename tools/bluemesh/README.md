# BlueMesh LAN Tools

These scripts sync Project Blue shared state between trusted creator PCs on the same Wi-Fi/LAN. They do not store the pairing token and they do not sync `.env`, token, secret, credential, or key/cert paths.

## 1. Make a pairing token

On one PC:

```powershell
.\tools\bluemesh\MAKE_BLUEMESH_PAIRING_TOKEN.ps1
```

Copy that token to the other creator through a private channel. Do not commit it.

## 2. Start the receiver bridge

On the PC that should receive updates:

```powershell
.\tools\bluemesh\START_BLUEMESH_LAN_SERVER.ps1 -Token "PASTE_TOKEN" -NodeId "qwen_pc" -CreatorId "creator_qwen" -ApproveImports
```

If Windows asks about firewall/network access, allow only on the trusted private network.

## 3. Push to the receiver

On the sending PC:

```powershell
.\tools\bluemesh\PUSH_BLUEMESH_TO_PEER.ps1 -PeerUrl "http://QWEN-PC-IP:8765" -Token "PASTE_TOKEN" -NodeId "adahn_pc"
```

Run the push in both directions when both PCs have updates.

## Offline fallback

If LAN is blocked, export a signed bundle and send the file manually:

```powershell
.\tools\bluemesh\EXPORT_BLUEMESH_BUNDLE.ps1 -Token "PASTE_TOKEN" -Output ".\bluemesh_bundle.json"
```

Then import it on the other PC:

```powershell
.\tools\bluemesh\IMPORT_BLUEMESH_BUNDLE.ps1 -Token "PASTE_TOKEN" -InputPath ".\bluemesh_bundle.json" -Approve
```
