# Conflict Resolution

BlueConflictResolver detects when two trusted nodes edit the same shared record from the same older base version.

A conflict report includes:

- the affected module and record key;
- both node IDs and creator IDs;
- base/current versions;
- version A and version B JSON;
- creator choices.

Choices are:

1. Keep version A.
2. Keep version B.
3. Merge both.
4. Create a manual review task.
