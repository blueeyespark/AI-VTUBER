# Interfaces and Module Contracts

## Core services

Every module should use stable interfaces for:

- identity and authentication;
- authorization and approval;
- policy evaluation;
- memory and knowledge retrieval;
- artifact storage;
- task execution;
- audit logging;
- notifications;
- host capabilities;
- backup and recovery.

## Module manifest

Required fields:

- module ID and semantic version;
- purpose and human owner;
- required and optional dependencies;
- requested permissions;
- data read/write classes;
- supported hosts;
- network destinations;
- safety classification;
- health checks and telemetry;
- test suite and evidence;
- upgrade, rollback, and retirement procedures.

## Task envelope

An executable task should carry:

- requester and intended beneficiary;
- natural-language intent plus structured parameters;
- target host, application, files, and services;
- permission and approval references;
- time, budget, and resource limits;
- policy decision;
- expected output and success criteria;
- cancellation and rollback instructions;
- audit correlation ID.

## Design rule

Capability modules communicate through contracts. They do not directly modify another module's private database or bypass Guardian.
