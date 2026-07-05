# Core Data Entities

The first database design should model these entities explicitly.

| Entity | Key fields |
|---|---|
| Identity | ID, public keys, DNA version, status |
| Constitution | version, articles, signatures, effective date |
| Steward | identity, role, authority scope, validity |
| User | identity, consent profile, permissions |
| Host | device ID, trust state, capabilities, last attestation |
| Module | ID, version, manifest, permissions, dependencies |
| Memory | class, content reference, owner, provenance, retention |
| Knowledge Item | claim, evidence class, citations, confidence, review |
| Project | owner, members, goals, assets, decisions |
| Task | requested action, approvals, status, outputs |
| Approval | actor, scope, decision, expiry, conditions |
| Audit Event | actor, action, target, result, timestamp, integrity proof |
| Artifact | file hash, creator, license, version, storage locations |
| Backup | scope, encryption, location, verification, restore test |
| Recovery Event | cause, authority, restored version, validation |
| Presence Session | platform, participants, invitation, consent, recording rule |

Sensitive content should be referenced through encrypted storage rather than duplicated across tables.
