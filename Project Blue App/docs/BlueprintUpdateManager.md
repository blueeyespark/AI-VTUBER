# BlueUpdateManager

BlueUpdateManager is the GitHub-aware update planner for BlueMesh.

Responsibilities:

- check the local Git revision;
- compare against a remote tracking branch;
- notify creators when an update exists;
- require approval before pulling;
- plan rollback to a previous stable revision.

The first version plans commands instead of executing destructive updates automatically.