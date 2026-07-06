# Manage cost

::: tip Why budgets?
AI usage costs money per request. Budgets let you cap spend — per person and
company-wide — so there are no surprises and no runaway bills.
:::

## Set a budget when you create an assistant

You can give an assistant a monthly spend cap the moment you create it — see
[Create your first employee assistant](/guide/first-tenant).

## Adjust budgets later

You can also set a company-wide ceiling, cap or change one person's budget, and
check what anyone has spent this month, at any time. Manage this from the command
line — see [CLI reference → `oc budget`](/reference/cli#oc-budget).

When someone hits their cap, their assistant pauses AI calls until the budget resets
or you raise it — it never silently overspends.

## Choose your AI provider

You're not tied to one vendor. OpenCrane supports two distinct ways to connect a
model provider, and it's worth knowing which one you're using:

::: info Provider keys vs. BYOK — two distinct paths
**Provider keys** (below) are the everyday way to add a vendor key from the CLI.
**BYOK** (bring your own key) is a separate, org-admin-only path that provisions one
raw upstream key for the whole silo directly into the model-routing layer. They are
not the same mechanism — see [Bring your own provider key](#bring-your-own-provider-key-byok)
below for when to reach for BYOK instead.
:::

### Provider keys

Add the model providers your company uses, and switch freely between them. Use
Claude, GPT, or open-source models without changing anything about your assistants
or skills. Budget and provider changes are recorded in the [audit log](/guide/audit).

Manage this from the command line — see [CLI reference → `oc providers`](/reference/cli#oc-providers).

### Bring your own provider key (BYOK)

BYOK is a separate path for an org-admin to set one raw upstream provider key per
provider for the **whole silo**, rather than per-assistant. The key is written into a
Kubernetes Secret and registered with LiteLLM — assistants never receive it directly.
Instead, each assistant gets a per-tenant LiteLLM virtual key that carries its own
spend budget and model allow-list. The raw key is never returned by any read endpoint.

When you set a BYOK key for a provider, LiteLLM automatically makes that provider's
models available to route assistant calls through. You can then use
[`oc model`](/reference/cli#oc-model) to register specific model definitions backed
by that provider credential.

BYOK is API-only today — there is no `oc` sub-command for it yet. See
[CLI reference → BYOK](/reference/cli#oc-providers) for the API routes and
authorisation requirements.
