# Manage cost

::: tip Why budgets?
AI usage costs money per request. Budgets let you cap spend — per person and
company-wide — so there are no surprises and no runaway bills.
:::

## Set a budget when you create an assistant

```bash
oc tenants create --name alice --display-name "Alice" --email alice@example.com \
  --budget 50        # monthly cap, in USD
```

## Adjust budgets later

```bash
oc budget set-global 5000        # company-wide monthly ceiling
oc budget global                 # show the global ceiling

oc budget set-account alice 75   # cap for one person
oc budget accounts               # all per-person caps

oc budget spend alice            # what Alice has spent this month
```

When someone hits their cap, their assistant pauses AI calls until the budget resets
or you raise it — it never silently overspends.

## Choose your AI provider

You're not tied to one vendor. Add the model providers your company uses, and switch
freely:

```bash
oc providers list
oc providers set claude <api-key>
oc providers set openai <api-key>
oc providers delete claude
```

Use Claude, GPT, or open-source models without changing anything about your
assistants or skills. Budget and provider changes are recorded in the
[audit log](/guide/audit).

## Bring your own provider key (BYOK)

An org-admin can set one raw upstream provider key per provider for the whole silo.
The key is written into a Kubernetes Secret and registered with LiteLLM — assistants
never receive it directly. Instead, each assistant gets a per-tenant LiteLLM virtual
key that carries its own spend budget and model allow-list. The raw key is never
returned by any read endpoint.

::: tip How BYOK keys seed the model catalogue
When you set a BYOK key for a provider, LiteLLM automatically makes that provider's
models available to route assistant calls through. You can then use
[`oc model`](/reference/cli#oc-model) to register specific model definitions backed
by that provider credential.
:::

BYOK is an org-admin action. There is no `oc` sub-command for it — use the API
directly or the platform admin UI:

```
PUT  /api/v1/providers/byok/:provider   Set or refresh the raw provider key
GET  /api/v1/providers/byok             List configured BYOK providers (presence + timestamps, no key material)
DELETE /api/v1/providers/byok/:provider Remove a provider key
```

Supported provider values are defined in the `ByokProvider` contract enum (e.g.
`openai`, `anthropic`). The mutation requires an IdP-verified org-admin identity.
