# Project Blue Independent IDE — Phase 9

Phase 9 adds a first-party Blue Extensions system.

## Implemented

- Validated `blue-extension.json` manifests with IDs, semantic versions, Project Blue engine compatibility, activation events, declared permissions, dependencies, and contributions.
- Approval-gated unpacked extension install, update, and uninstall.
- Enable, disable, activate, and deactivate lifecycle controls.
- A separate Node extension-host process so extension failures do not crash Electron's main process.
- Commands, sidebar views, custom editors, language metadata, and settings contributions.
- Runtime workbench registration for contributed sidebar views and editor tabs.
- Persistent local extension registry under `.blue/extensions`; `.env`, `.git`, and `node_modules` are excluded from installation.
- Bundled `Hello Workbench` sample proving an extension can contribute a runnable command, sidebar view, and custom editor without editing Project Blue core.

## Security boundary

Extensions are local code and require explicit creator approval to install or remove. Process isolation protects the main application from ordinary extension crashes. The permission manifest is the foundation for later capability-level OS sandbox enforcement; it is not represented as a complete hostile-code sandbox.

## Verification

- Extension lifecycle tests cover manifest validation, approval gates, contributions, isolated command execution, enable/disable, activation/deactivation, and uninstall.
- The Control Center audit verifies every visible extension button has a renderer-to-main destination.
- Full desktop regression suite passes with the Phase 9 acceptance check.
