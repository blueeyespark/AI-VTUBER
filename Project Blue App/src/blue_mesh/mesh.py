from __future__ import annotations

from pathlib import Path

from .conflict import BlueConflictResolver
from .db import BlueMeshDatabase
from .identity import BlueIdentity
from .ledger import BlueLedger
from .local_agent import LocalAgentRegistry
from .node import BlueNode
from .relay import BlueMeshRelay
from .sync import BlueSync
from .trust import BlueTrust


class BlueMesh:
    """Facade for one shared Blue identity across many trusted local nodes."""

    def __init__(self, db_path: str | Path):
        self.database = BlueMeshDatabase(db_path)
        self.database.connect()
        self.identity = BlueIdentity(self.database)
        self.node = BlueNode(self.database)
        self.ledger = BlueLedger(self.database)
        self.trust = BlueTrust()
        self.conflicts = BlueConflictResolver(self.database, self.ledger)
        self.sync = BlueSync(self.database, self.ledger, self.conflicts, self.trust)
        self.relay = BlueMeshRelay(self.database, self.sync)
        self.local_agent = LocalAgentRegistry(self.database)

    def close(self) -> None:
        self.database.close()

    def __enter__(self) -> "BlueMesh":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()