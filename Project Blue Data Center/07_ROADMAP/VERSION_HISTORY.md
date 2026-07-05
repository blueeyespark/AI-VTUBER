# Project Blue Version History

Verified through: `v0.8.0`  
Permanent application: `C:\Users\adahn\Downloads\ai blue project\Project Blue App`

## v0.1.0

Identity, Constitution, memory, policy, audit, providers, diagnostics, and CLI.

## v0.2.0

Projects, tasks, approvals, history controls, shell, and verified backups.

## v0.3.0

Secure localhost dashboard, search, memory tools, and provider diagnostics.

## v0.4.0

Sources, citations, named conversations, receipts, FTS5, and model setup.

## v0.5.0

Read-only workspace indexing, diffs, approved atomic edits, and restore drills.

## v0.6.0

Workspace policies, proposal expiry/rejection, freshness, and safe rollback.

## v0.7.0

Workspace roles, expiring approvals, signed proposal bundles, and recorded
backup-maintenance verification.

## v0.8.0

- Password-authenticated principals using `scrypt`
- Approval quorum from distinct principals
- Windows DPAPI-protected secret vault
- Signing keys excluded from readable exports
- HMAC-SHA256 signed release manifests
- Signature plus installed-file hash verification
- First-run identity, creator, and backup onboarding

## Cumulative verification

- 67 tests passed; 0 failed
- Live database preserved during installation
- Constitution and audit chain verified
- v0.8 backup and restore drill passed
- Seven versioned backups passed checksum and integrity checks
- Final release signature valid
- All 20 signed application files matched

v0.8.0 contains every implemented system from v0.1.0 onward.
