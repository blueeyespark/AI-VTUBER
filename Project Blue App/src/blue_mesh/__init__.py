"""BlueMesh: shared Project Blue identity replicated across trusted devices.

Blue may run on many creator PCs, but this package treats those PCs as nodes of
one shared identity instead of separate AIs.
"""

from .mesh import BlueMesh
from .prototype import run_first_working_prototype

__all__ = ["BlueMesh", "run_first_working_prototype"]