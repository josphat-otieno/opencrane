# Single Ownership Decision Clarification

## Decision Summary

Projection writes should have one authoritative owner to avoid split-brain behavior.

## Current Direction

- **Authoritative writer target**: operator-side projection loop.
- **Reason**: operator already watches Kubernetes state and is closest to source-of-truth lifecycle events.

## Why This Matters

Without single ownership, request-path writes and watcher writes can diverge:

- race conditions on tenant/policy state
- inconsistent audit timelines
- hard-to-debug drift between Kubernetes and PostgreSQL projections

## Practical Transition Model

1. Keep compatibility shims temporarily where required.
2. Route all new projection mutations through the single writer path.
3. Remove remaining dual-write paths once parity checks pass.

## Guardrails

- Idempotent projection operations.
- Drift metrics and repair endpoints.
- Explicit runbook procedures for projection mismatch incidents.

## Open Follow-up

- Final cutover criteria and rollback policy should be tracked with measurable drift/error thresholds before full dual-write retirement.
