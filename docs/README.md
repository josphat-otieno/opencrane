# OpenCrane docs

Engineering reference material for the platform: design decisions, research that
seeded a track, specifications, and the agent guidance. This is **internal
reference**, not the reader-facing product docs — those live in
[`website/`](../website) (published to opencrane.ai). A doc here may be the source a
website page summarises, but it is not itself published.

Forward-looking plans stay at the repo root (`plan.md`, `plan-done.md`,
`silo-multi-tenant-plan.md`, `future-work.md`, `harvesting-agents-plan.md`). Once a
plan is realised, its outcome is recorded in `plan-done.md` and any durable design
detail lands under `design/` here.

| Folder | What it holds |
|--------|---------------|
| [`agents/`](agents/) | Canonical agent guidance, indexed by [`AGENTS.md`](../AGENTS.md). Load the topic file that matches the work in front of you. **Do not move or rename these** — the index links to them. |
| [`adr/`](adr/) | Architecture Decision Records — settled decisions with the alternatives weighed and consequences accepted, so a later reader does not relitigate them. |
| [`design/`](design/) | Realised design notes kept as history — the *how* behind shipped work whose plan has been archived to `plan-done.md`. |
| [`decisions/`](decisions/) | Point decisions too small for an ADR but worth recording. |
| [`briefs/`](briefs/) | Product/architecture briefs and RFCs that framed a body of work (some fully realised, some ongoing). |
| [`research/`](research/) | Research reports that seeded a roadmap track (LiteLLM BYOK/BYOM + autonomous router, communication connectors). |
| [`specs/`](specs/) | Component specifications that remain a live reference (e.g. the MCP catalogue credential model). |
| [`operators/`](operators/) | Operator-facing engineering notes that back a website runbook. |
| [`optimalisation-plan.md`](optimalisation-plan.md) | Living cluster-optimisation plan (Cilium enforcement, node consolidation, plane pooling, scale-to-zero). Active. |

## Conventions

- Reference material is UK English, sentence-case headings, no frontmatter.
- When a plan is realised, record the outcome in `plan-done.md` and move any lasting
  design detail into `design/` — don't leave a completed plan floating at the root.
- ADRs are append-only: supersede, never rewrite (see [`adr/README.md`](adr/README.md)).
