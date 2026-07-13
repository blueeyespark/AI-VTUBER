"""BlueMesh: one Project Blue identity replicated across trusted devices."""

from .mesh import BlueMesh
from .prototype import run_prototype

run_first_working_prototype = run_prototype

__all__ = ["BlueMesh", "run_prototype", "run_first_working_prototype"]
__version__ = "0.2.0"
