from __future__ import annotations
import argparse
import json
from blue_workspace import BlueWorkspaceAgent

parser = argparse.ArgumentParser(description="Project Blue read-only workspace agent")
parser.add_argument("root")
parser.add_argument("command", nargs="?", default="/workspace")
args = parser.parse_args()
agent = BlueWorkspaceAgent(args.root)
print(json.dumps(agent.slash_command(args.command), indent=2))
