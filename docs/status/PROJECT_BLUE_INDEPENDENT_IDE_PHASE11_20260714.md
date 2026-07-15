# Project Blue Independent IDE — Phase 11

Phase 11 connects Blue-specific capabilities to the same workbench and agent interface used by the independent IDE.

## Unified capability service

`Project Blue App/desktop_pet/blue-feature-service.cjs` provides one discoverable map for:

- Blue Memory and conversations
- BlueMesh shared identity
- Discord
- Streaming Studio and OBS readiness
- voice
- vision and presence
- desktop companion/avatar
- research and learning records
- ideas
- generated content
- creator workflows

Each capability declares its workbench activity and editor. This keeps the feature inside the common IDE shell rather than creating another dashboard page.

## Chat and API access

- `/blue features` lists the integrated capabilities and their workbench locations.
- `/blue <feature> status` reads a feature status through its adapter.
- Mutating idea and workflow actions require the final word `APPROVE`.
- Renderer integrations use `featureCatalog()` and `featureAction()` through the existing trusted Electron bridge.

No token, password, `.env` value, or other secret is included in this catalog. Discord and streaming credentials retain their existing session-only handling.

## Verification

- focused service and Workspace Agent tests
- Phase 11 workbench integration acceptance tests
- full desktop test suite
- JavaScript syntax checks and control audit

