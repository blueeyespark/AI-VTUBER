# BlueIdentity

BlueIdentity stores the single shared Project Blue identity.

It records:

- `blue_id`
- display name
- creators and creator roles
- trusted device records
- Constitution data
- core identity metadata

The default shared ID is:

```text
blue-shared-identity
```

The identity rule is:

```text
Blue may have many devices, but only one identity.
```

Creators can register devices as trusted nodes, but a trusted node is still only a replica of the same Blue identity.