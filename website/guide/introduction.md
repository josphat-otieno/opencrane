# What is OpenCrane?

OpenCrane is a **self-hosted, Kubernetes-native control plane for organizational
AI**. It lets a company issue an isolated, personal AI assistant — powered by
[OpenClaw](https://github.com/openclaw/openclaw) — to every employee, while
keeping complete control over security, governance, skills, organizational
knowledge, and LLM cost.

Agent frameworks work beautifully for one person. OpenCrane answers the question
that follows: **what happens when you scale to a whole organization?** How do you
give everyone their own assistant, share skills across teams, govern access to
company knowledge, and keep it all secure, compliant, and up to date — without
chaos, and without handing your workflows to a vendor?

## Why self-host?

Vendor-hosted AI platforms are convenient, but they carry hidden cost:

| Aspect | Vendor-hosted | Self-hosted (OpenCrane) |
|--------|---------------|-------------------------|
| Skill ownership | Vendor hosts & can analyse your skills | You own everything |
| Competitive risk | Vendor learns your workflows | Your workflows stay private |
| Model switching | Locked to the vendor's LLM | Use any LLM provider |
| Data residency | Vendor's servers | Your infrastructure |
| Regulatory control | Vendor's terms | Full compliance under your control |
| Pricing | Vendor can change at will | You control infrastructure cost |

OpenCrane keeps personal assistants, shared skills, and organizational knowledge
**completely under your control** — while still providing the convenience and
scale of a cloud-native platform.

## How it works

Each employee gets a private AI assistant running as an isolated Kubernetes pod.
That assistant:

- **Knows who you are** — holds your personal access tokens and acts across the
  organization's platforms *as you*.
- **Stays private** — conversations are stored in the pod's encrypted storage.
  OpenCrane enforces network policy and budget, but does not inspect conversation
  content.
- **Accesses organizational knowledge** — queries the Cognee knowledge plane
  directly during the agentic loop, with role-based scoping and citations.

OpenCrane also runs **company-wide harvesting agents** that continuously ingest
knowledge from Slack, Teams, email, and ticketing systems into a central Org
Knowledge Index, made available to assistants with automatic role-based
filtering.

The platform orchestrates all of this through:

- **Infrastructure management** — deploying and updating per-employee assistants,
  enforcing per-tenant token budgets and cost limits.
- **A permissions control plane** — managing dataset memberships and grants
  without sitting in the retrieval request path.
- **A uniform awareness runtime** — a common contract across every assistant for
  scope selection, citations, fallback, and freshness.
- **Skill sharing** — promotion and delivery of skills across org, department,
  project, and personal scopes.

## Who is this for?

- **Operators** deploy and run the platform — see the
  [Operators](/operators/hosting) guides.
- **Integrators / developers** register MCP servers, publish skills, and consume
  the typed [Contracts SDK](/integrators/contracts-sdk).
- **Everyone** can read the [Concepts](/concepts/tenancy) to build a mental model.

Start with the [architecture overview](/guide/architecture), then head to
[Getting Started](/guide/getting-started).
