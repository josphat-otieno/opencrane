# Organizational knowledge

OpenCrane can harvest your company's knowledge — from Slack, Teams, email, tickets,
and more — into a central index. Assistants then **retrieve from it during a
conversation**, with role-based scoping and citations, so answers are grounded in
your organization's own information.

## How it works

- **Harvesting agents** continuously ingest knowledge into the index, organised by
  scope (org / team / project / personal).
- During a conversation, the assistant **queries the index directly** and returns
  answers with citations. OpenCrane never sits in the conversation path — it only
  decides what each assistant is allowed to see.
- What an assistant can retrieve is governed by [access policies](/guide/permissions).

## Consistent behaviour across the fleet

Every assistant follows a shared **awareness contract** — the same rules for scope
selection, citations, freshness, and fallback. You roll changes out safely
(canary → wider) and can roll back in one step:

```bash
oc awareness list
oc awareness rollout <version>
oc awareness evaluate <version>
```

## Keep contexts separate

To stop one project's context from leaking into another chat, bind a session to a
scope:

```bash
oc sessions scope set <sessionKey> --scope project/acme
oc sessions scope show <sessionKey>
oc sessions scope clear <sessionKey>
```

## Learn more

The retrieval plane, datasets, and freshness model are covered in
[Retrieval & memory](/integrators/retrieval-memory). SLOs and dashboards are in
[Awareness SLOs](/operators/awareness-slos).
