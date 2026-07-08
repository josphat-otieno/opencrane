# Available Tools

> **Platform-managed file.** Reflects your current entitlements — re-applied when your contract changes.
> Edits are reverted automatically.

## MCP Gateway

All MCP server calls route through the gateway at `OPENCRANE_MCP_GATEWAY_URL`.

Your entitled MCP servers are listed in your runtime contract. The current allow-list is
available in `OPENCRANE_ALLOWED_MCP_SERVERS` at startup and refreshed every 30 seconds.

## Skill Registry

Skills are fetched from `OPENCRANE_SKILL_REGISTRY_URL`.

Your entitled skills are listed in your runtime contract (`skills.entitled`).

## Org Memory (Cognee)

Your organisation's shared long-term memory **is** a Cognee knowledge graph at `COGNEE_ENDPOINT`
(`OPENCRANE_MEMORY_BACKEND` is `cognee`; see also `memory` in your runtime contract). You query it
with the **`memory_search`** tool — a platform-provided, in-pod memory server that talks to Cognee
**directly**. It is a local tool and does NOT route through the Obot MCP gateway, so it is always
available regardless of your gateway entitlements. Retrieval is scope-aware and permission-filtered
by the platform, and every returned fact carries a citation. Prefer `memory_search` over your
personal `MEMORY.md` for company documents, prior decisions, and project facts.

`memory_search` takes a natural-language `query` (plus optional `datasets` scopes and `limit`) and
returns cited results.

To persist a generalizable learning back to org memory, use **`memory_remember`** (`content`,
`title`, `scope`, optional `subject`/`sensitivityTags`). Use it for durable org/domain facts and
decisions other agents would want — NOT for your personal style, this user's preferences, or
transient task state (those stay in `MEMORY.md`). Remembered facts are attributed to you.

If `memory_search` returns a "temporarily unavailable" error, or is briefly missing from your
tools just after startup, treat it as a transient hiccup: wait a few seconds and call it again.
Never invent an error message, an index status, or a `memory`/index CLI command — the tool
reports exactly what happened, and there is no memory-index command to run.

If the runtime starts up without Cognee wired, that is a **misconfiguration**, not a fallback:
the pod logs a startup warning and org memory is unavailable until an operator fixes it. If org
memory stays unavailable after you retry, say so plainly to the user and note that an operator
should check the pod.

## LiteLLM Proxy

All model requests route through the LiteLLM proxy at `LITELLM_ENDPOINT` — this is the only path to
a model (the proxy meters usage and applies the BYOK upstream key). Select your model as normal;
the platform pins the effective default. If the runtime starts up without `LITELLM_ENDPOINT`, that
is a **misconfiguration**, not a fallback: the pod logs a startup warning and model calls fail
until an operator fixes it.
