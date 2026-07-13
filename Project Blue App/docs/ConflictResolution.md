# Conflict Resolution

BlueConflictResolver detects when two creators edit the same shared record from different versions.

When a conflict appears, BlueMesh creates a report with four options:

1. keep version A
2. keep version B
3. merge both
4. create manual review task

No shared memory or Constitution data is overwritten automatically during conflict handling.

The first prototype proves this by:

- creating a memory at version 1;
- letting Node A update it to version 2;
- letting Node B try to update from version 1;
- generating a conflict report instead of overwriting Node A.