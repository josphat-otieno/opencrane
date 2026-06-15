# Awareness contract & retrieval

Every assistant in the fleet behaves consistently when it reaches for
organizational knowledge. That consistency comes from the **uniform awareness
contract** — and the retrieval path itself is **direct from the pod to the
knowledge plane**, with the control plane handling only permissions.

## Direct retrieval

During the agentic loop, the OpenClaw/Clawdbot runtime queries **Cognee
directly** for the context it needs. The control plane does **not** sit in the
retrieval request path — it only syncs dataset memberships and grants. This keeps
retrieval fast and keeps the control plane out of conversation content.

```
Agent reasoning ──▶ Retrieval runtime (in the pod) ──▶ Cognee
                    1. resolve awareness contract
                    2. query Cognee directly
                    3. return scoped results + citations
```

## The uniform awareness contract

The awareness contract is a **versioned, declarative schema** that defines how
every assistant handles:

- **scope selection** (org / dept / project / personal),
- **citations** (required),
- **freshness** behaviour, and
- **fallback** rules.

It uses a **hybrid model**: the declarative schema is the source of truth, a shared
OpenClaw SDK is the execution engine, and the control plane serves a per-scope
**effective-contract** endpoint that the pod re-pulls at loop boundaries.

## Safe fleet rollouts

Contract changes roll out safely:

- **SemVer compatibility** between contract versions,
- **canary cohorts** — personal → project → department → org,
- **golden-query gating** — zero policy violations is a hard gate before
  promotion, and
- **one-step rollback** by contract ID.

Operators monitor this with [awareness SLOs](/operators/awareness-slos) and drive
rollouts with `oc awareness rollout` / `oc awareness evaluate`.

## Session scope binding

To stop one project's context from spilling into another chat window, sessions can
be **bound to a scope** (`oc sessions scope set|show|clear`).

## Related

- [Retrieval & memory (Cognee)](/integrators/retrieval-memory)
- [Access policies & grants](/concepts/access-policies)
- [Awareness SLOs](/operators/awareness-slos)
