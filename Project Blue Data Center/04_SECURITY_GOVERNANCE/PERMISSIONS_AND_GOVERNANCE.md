# Permissions and Governance

## Roles

- **Creator:** founding authority while active, still bound by the Constitution and law.
- **Steward:** designated maintainer with a documented scope.
- **Operator:** manages approved hosts or services.
- **User:** uses granted capabilities and controls their own data.
- **Auditor:** reviews logs, controls, and compliance without operational authority.
- **Module:** nonhuman principal with explicit machine-enforced permissions.

## Approval rules

Approval must state actor, action, target, scope, constraints, expiry, and whether it can recur. Silence is not approval.

High-impact actions require stronger controls, including:

- financial transfers;
- installation or system configuration;
- deletion or irreversible transformation;
- publication or external messaging;
- health, legal, employment, or safety decisions;
- security changes and credential access;
- robotics motion in shared or hazardous spaces;
- constitutional or governance changes.

## Blue Council

A future council of trusted stewards may review major architectural, financial, ethical, or succession decisions. Council membership, quorum, conflicts, emergency authority, and appeals must be formally defined before activation.

## Auditability

Important decisions record inputs, policy checks, approvals, outputs, and errors. Logs protect privacy through access control and minimization while remaining sufficient for investigation.
