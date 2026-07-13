from __future__ import annotations

from pathlib import Path
from typing import Any


BLOCKED_FILE_NAMES = {".env", ".env.local", ".env.production"}
BLOCKED_SUFFIXES = {".pem", ".key", ".pfx", ".p12"}


class BlueRelayService:
    """Plans LAN or internet relay sync without storing secrets in BlueMesh."""

    def validate_sync_path(self, path: str | Path) -> None:
        candidate = Path(path)
        lowered = candidate.name.lower()
        if lowered in BLOCKED_FILE_NAMES or candidate.suffix.lower() in BLOCKED_SUFFIXES:
            raise PermissionError(f"Refusing to sync sensitive file: {candidate.name}")

    def lan_plan(self, *, peer_host: str, port: int = 8765) -> dict[str, Any]:
        return {
            "mode": "lan",
            "peer_host": peer_host,
            "port": port,
            "requires_pairing_code": True,
            "tokens_stored": False,
        }

    def internet_relay_plan(self, *, relay_name: str) -> dict[str, Any]:
        return {
            "mode": "internet_relay",
            "relay_name": relay_name,
            "requires_creator_approval": True,
            "tokens_stored": False,
        }
