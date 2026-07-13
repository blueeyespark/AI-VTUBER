from __future__ import annotations

from pathlib import Path

from .conflict import BlueConflictResolver
from .identity import BlueIdentityService
from .ledger import BlueLedgerService
from .local_agent import BlueLocalAgentRegistry
from .node import BlueNodeService
from .relay import BlueRelayService
from .storage import BlueMeshStore
from .sync import BlueSyncService
from .trust import BlueTrustService
from .update_manager import BlueUpdateManager


class BlueMesh:
    """Facade that wires all BlueMesh modules to one SQLite database."""

    def __init__(self, database_path: str | Path):
        self.store = BlueMeshStore(database_path)
        self.ledger = BlueLedgerService(self.store)
        self.trust = BlueTrustService()
        self.conflicts = BlueConflictResolver(self.store, self.ledger)
        self.identity = BlueIdentityService(self.store, self.ledger)
        self.nodes = BlueNodeService(self.store, self.ledger)
        self.sync = BlueSyncService(self.store, self.ledger, self.conflicts, self.trust)
        self.relay = BlueRelayService()
        self.local_agent = BlueLocalAgentRegistry(self.store)
        self.update_manager = BlueUpdateManager(self.ledger)

    def close(self) -> None:
        self.store.close()

    def __enter__(self) -> "BlueMesh":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
