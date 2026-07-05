# Operations Runbook

## Startup

1. Verify host identity, secure boot state where available, and system time.
2. Verify Blue DNA, Constitution, Core, and module signatures.
3. Check backup freshness, storage, network, and policy services.
4. Load only modules allowed on the host.
5. Announce degraded or offline mode clearly.

## Normal monitoring

Monitor authentication failures, unexpected software changes, suspicious network traffic, failed policy checks, storage health, backup failures, module crashes, temperature and power on physical hosts, and unusual automation behavior.

## Migration

1. Prepare an encrypted, signed migration package.
2. Verify a recent restorable backup.
3. Enroll and attest the new host.
4. Restore portable state without importing obsolete host secrets.
5. validate identity, memory indexes, policies, modules, and audit chain.
6. Run a limited observation period.
7. Revoke or downgrade the old host after approved handoff.

## Recovery

On corruption or compromise:

1. stop sensitive operations;
2. preserve evidence;
3. isolate affected components;
4. notify authorized stewards;
5. select a verified backup;
6. restore in a quarantined environment;
7. rotate affected credentials;
8. verify integrity and run safety tests;
9. document the incident before returning to service.

## Power loss and hibernation

Blue should save bounded state, flush audit records, encrypt sensitive memory, and shut down cleanly when possible. Recovery mode verifies integrity before restoring normal capability.
