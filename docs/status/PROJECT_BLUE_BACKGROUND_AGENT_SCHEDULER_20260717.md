# Project Blue Background Agent Scheduler

Date: 2026-07-17

## Installed behavior

- Schedules any of Blue's ten read-only V8 analysis agents.
- Persists schedules under Blue's private `.blue/v8` runtime state.
- Starts the scheduler with Project Blue and resumes enabled schedules after restart.
- Runs only one instance of an agent at a time.
- Records bounded run history, finding counts, severity counts, and explanations.
- Fingerprints findings so Blue can report whether a result changed since the previous run.
- Advances a missed schedule once instead of attempting an unbounded catch-up loop.
- Requires explicit approval before enabling or changing a persistent schedule.
- Allows pausing immediately because pausing reduces activity.
- Never edits project files; findings require a separate reviewed proposal and approval.
- Offers optional Windows notifications for changed warning/high/critical findings.
- Keeps notifications off by default and requires explicit approval to enable or lower their severity threshold.
- Suppresses repeat alerts when a report fingerprint is unchanged.

## Blue Chat commands

```text
/agents
/agent-report architecture
/agent-scheduler
/agent-schedule architecture 60 APPROVE
/agent-pause architecture
/agent-history architecture 20
```

Intervals are expressed in minutes. Normal installations enforce a minimum five-minute interval and bound schedules to thirty days.

## Trusted application API

The Electron preload exposes `v8AgentScheduler(value)` through the existing trusted bridge. Supported actions are:

- `status`
- `catalog`
- `history`
- `configure`
- `pause`
- `resume`
- `run`
- `runDue`
- `notifications`

Enabling, resuming, changing an execution interval, or enabling/changing alerts requires `approved: true`. Disabling schedules or alerts is immediate. Tokens, credentials, `.env` files, and secret values are never scheduler inputs.

## Remaining future work

- Per-agent resource budgets beyond interval and history bounds.
- BlueMesh exchange of approved report summaries between trusted nodes.
