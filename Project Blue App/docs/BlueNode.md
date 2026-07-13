# BlueNode

BlueNode represents one PC running Project Blue.

Each node stores:

- unique `node_id`
- device name
- owner creator
- hardware metadata
- OS name
- local Project Blue paths
- online/offline status
- last seen timestamp

BlueNode is local-device identity, not Blue's core identity. Two PCs can have different node IDs while still carrying the same Blue ID.