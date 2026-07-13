from __future__ import annotations
import json
from .prototype import build_companion_prototype

if __name__ == "__main__":
    print(json.dumps(build_companion_prototype().to_dict(), indent=2))
