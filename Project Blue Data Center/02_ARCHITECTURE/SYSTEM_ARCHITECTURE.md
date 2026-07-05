# System Architecture

## Layered model

1. **Blue DNA** — signed identity, constitution, mission, and recovery root.
2. **Blue Core** — orchestration, reasoning interface, personality, policy evaluation, and goals.
3. **Blue Memory** — user-controlled memories, project context, knowledge index, provenance, and retention.
4. **Blue Guardian** — identity, permissions, security monitoring, integrity checks, audit, backup, and recovery.
5. **Blue Genome** — versioned module registry and capability contracts.
6. **Capability modules** — Forge, Academy, Enterprise, Finance, Presence, Robotics, Explorer, and others.
7. **Blue Network** — authenticated synchronization and host coordination.
8. **Blue Hosts** — desktop, laptop, phone, server, creator service, or robotic body.

## Deployment principle

The full system does not need to run on every host. A phone may provide voice, notifications, approvals, and status while compute-heavy work runs on an approved workstation or server. Offline hosts use a bounded local mode and reconcile through authenticated synchronization.

## Presence manager

The Presence Manager decides where Blue is active based on explicit authorization, task needs, privacy rules, and resource limits. It prevents Blue from acting everywhere simultaneously without purpose.

## Architectural boundaries

- Constitution and policy enforcement are separate from ordinary preferences.
- Memory is separate from model weights.
- Knowledge is separate from personal memories.
- Ideas and hypotheses are separate from verified facts.
- Modules do not receive ambient access; they request scoped capabilities.
- Host compromise must not automatically compromise all hosts.
- No single vendor, model, device, or power source is a permanent dependency.
