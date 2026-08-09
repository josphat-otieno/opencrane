# @opencrane/state/approvals/adapter - owner approval gateways

> [frontend](../../../README.md) > [state](../../README.md) > approvals > adapter

## What it owns

This package is part of the OpenCrane frontend state layer, between the browser UI and the
session-bound backend API. It owns the approval gateway port and the live adapter for owner-visible
tool approvals: the UI can list pending approvals and record one terminal decision, while the server
continues to own the run, policy, authority, and tool execution.

In the approvals flow, the conversation feature first learns from live progress that a run is waiting
for approval. This package then reads the display-safe pending approval list, hands cards back to the
feature, and posts only the selected approval id plus an `approved` or `denied` decision.

```text
 conversation feature
        | sees run waiting for approval
        v
 approvals/adapter  <-- HERE
        | GET /api/v1/me/approvals
        | POST /api/v1/me/approvals/:id/decision
        v
 OpenCrane API owns run authority and tool execution
```

Invariant: the browser never receives raw tool arguments, proof data, policy digests, subject
coordinates, resume credentials, or tool results. A failed or stale decision returns a display state
for the card rather than letting the UI invent runtime authority.

## Public surface

- `ApprovalDecisionGateway` - narrow port for listing pending approvals and deciding one approval.
- `APPROVAL_DECISION_GATEWAY` - dependency-injection token consumed by routed conversation features.
- `OpenCraneApprovalDecisionGateway` - generated-client implementation of the approval list and
  decision endpoints.
- `ApprovalCardView` - display-safe card model derived from the public approval contract.
- `ApprovalDecisionStates`, `ApprovalDecisions`, and `ApprovalDecisionFailures` - enums for card
  state, terminal decisions, and user-visible failure classes.

## Boundary

Consumed by the conversation feature through dependency injection. It depends on
`ControlPlaneApiService` for the cookie-session generated API client and deliberately does not choose
a run, select a subject, carry a resume credential, expose raw tool input, or execute a tool. The
backend decides whether an approval is still valid and whether a decision is authorised.

## Dependency direction

Tagged `scope:web` and `type:state`: it may depend on other web or shared packages, here Angular,
`@opencrane/core`, and the generated contracts. It must not import feature packages, apps, or backend
domain packages.

## See also

- Parent index: [state](../../README.md)
- Siblings: [conversation/adapter](../../conversation/adapter/README.md) and
  [gateways](../../gateways/README.md)
