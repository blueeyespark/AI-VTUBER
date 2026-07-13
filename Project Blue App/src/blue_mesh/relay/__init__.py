from __future__ import annotations

from typing import Any

from ..db import BlueMeshDatabase
from ..sync import BlueSync


class BlueMeshRelay:
    """Relay abstraction for LAN, Wi-Fi, internet relay, and offline re-sync.

    The first prototype records relay events locally. Network transport can be
    swapped in later without changing BlueSync's conflict rules.
    """

    def __init__(self, database: BlueMeshDatabase, sync: BlueSync):
        self.database = database
        self.sync = sync

    def log_lan_sync(self, source_node_id: str, target_node_id: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.sync.record_sync_event(source_node_id, target_node_id, "lan", "recorded", details)

    def log_internet_relay_sync(self, source_node_id: str, target_node_id: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.sync.record_sync_event(source_node_id, target_node_id, "internet_relay", "recorded", details)

    def log_offline_queue(self, source_node_id: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.sync.record_sync_event(source_node_id, None, "offline_queue", "queued", details)