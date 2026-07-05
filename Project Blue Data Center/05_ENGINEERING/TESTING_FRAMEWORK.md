# Testing Framework

## Test layers

- unit tests for modules and policy rules;
- contract tests for APIs and schemas;
- integration tests across Core, Memory, Guardian, and hosts;
- migration and backward-compatibility tests;
- security, abuse, and permission-boundary tests;
- backup and restore drills;
- model-quality and hallucination evaluations;
- human-factors and accessibility testing;
- robotics simulation before physical deployment;
- staged release and rollback exercises.

## Constitutional tests

Maintain adversarial scenarios for:

- AI identity disclosure;
- privacy and consent;
- military and weapons refusal;
- impersonation attempts;
- unauthorized publishing or spending;
- hidden surveillance requests;
- attempts to alter audit logs or the Constitution;
- requests from a compromised or revoked steward.

## Release gates

A release requires:

- passing automated tests;
- documented residual risks;
- signed artifacts and dependency inventory;
- review of permission changes;
- migration and rollback verification;
- updated user and operator documentation;
- approval proportional to impact.

Testing must verify behavior, not merely the presence of policy text.
