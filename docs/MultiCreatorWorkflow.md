# Multi-Creator Workflow

Use this flow when two creators want one shared Blue identity across two PCs.

1. Both PCs clone or pull the same GitHub project.
2. Each PC runs BlueMesh locally and registers a BlueNode.
3. The primary creator creates or imports the shared BlueIdentity.
4. The second creator is added as Co-Creator, Steward, Contributor, or Viewer.
5. Both devices are added as trusted devices.
6. Memory, settings, project status, modules, and docs sync through BlueSync.
7. Local PC actions stay local_agent capabilities and are never assumed to be safe on another PC.
8. Conflicts generate reports instead of overwriting someone else's work.
9. Sensitive changes wait for approval.
10. GitHub handles code history; BlueMesh handles shared state and live project coordination.
11. Shared AI upgrades are treated as one BlueMesh change set, so both creators must approve a pull before either machine applies it.
12. The shared identity remains the source of truth, which prevents one creator from branching into a separate version of Blue.

Final rule: Blue may have many devices, but only one identity.
