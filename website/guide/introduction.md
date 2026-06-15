# What is OpenCrane?

OpenCrane gives **every employee their own private AI assistant** — powered by
[OpenClaw](https://github.com/openclaw/openclaw) — running on your own
infrastructure, under your control.

You run one **control plane**. From it you issue assistants to people, decide what
each one can see and do, share skills and tools across teams, connect
organizational knowledge, and keep an eye on cost — all through a single API and
the `oc` command-line tool.

## What you can do

- **Give someone an assistant** — create a *tenant* and that person gets a private,
  isolated AI assistant at their own URL. → [Create your first tenant](/guide/first-tenant)
- **Let them use it** — they sign in once and connect to OpenClaw in the browser.
  → [Connect to OpenClaw](/guide/connect)
- **Control what it can access** — grant or deny knowledge, tools, and skills per
  person, team, or project. → [Control access](/guide/permissions)
- **Add skills** — publish reusable skills and roll them out across the org.
  → [Add skills](/guide/skills)
- **Connect tools** — wire assistants to Slack, Jira, and other systems over MCP.
  → [Connect tools](/guide/tools)
- **Connect knowledge** — harvest company knowledge so assistants can answer with
  citations. → [Organizational knowledge](/guide/knowledge)
- **Stay in control of cost** — set per-person budgets and track spend.
  → [Budgets & cost](/guide/budgets)

## Why self-hosted?

Vendor-hosted AI platforms are convenient, but your workflows, proprietary skills,
and employees' conversations live on someone else's servers. OpenCrane keeps all of
it on your infrastructure:

- **You own your skills and knowledge** — never analysed or monetised by a vendor.
- **Model independence** — use Claude, GPT, or open-source models; switch any time.
- **Data sovereignty** — conversations and company data stay on your network.
- **Governance built in** — access control, budgets, and a full audit trail.

## How it works (in one minute)

Each person's assistant runs in isolation with its own private, encrypted storage.
It knows who they are, answers in the channels they already use, and can pull in
company knowledge, skills, and tools — but only what you've allowed. OpenCrane
enforces access, budgets, and network policy; it does **not** read conversation
content.

Everything is **API-first**: the `oc` CLI and any custom UI are just clients of the
same versioned API.

Ready? → **[Install OpenCrane](/guide/getting-started)**, then
**[create your first tenant](/guide/first-tenant)**.
