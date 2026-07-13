# Project Blue v2.2 Installed Build Status

Target core version: `2.2.0`  
Target desktop version: `1.2.0`  
Date: 2026-07-03

## Added

- versioned Blue Genome module registry;
- embedded primary-source research catalog;
- Laboratory records for ideas, hypotheses, experiments, and findings;
- confidence, assumptions, provenance, evidence links, audit, search, export;
- Idea Lab, Capability Map, and Research Sources control-panel tools;
- explicit Electron renderer sandboxing and denied child windows;
- full research and prioritized capability map.

## Verification

- 88 Python tests passed;
- desktop JavaScript checks passed;
- npm dependency audit found zero vulnerabilities;
- sandboxed Electron/VRM runtime smoke test passed;
- Laboratory CLI workflow passed;
- no model, purchase, or cloud account was installed.

## Data protection

Installation must preserve `.blue`, `backups`, `release_backups`, avatar
sources, movement references, and existing research. A v2.1 database and source
snapshot is required before v2.2 activation.
