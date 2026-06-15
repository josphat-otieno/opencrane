# Budgets & cost

OpenCrane tracks LLM spend per assistant and lets you cap it — so no single person
or runaway task can blow your budget.

## Set a budget and track spend

```bash
oc budget set jente --limit 50        # cap monthly spend for one assistant
oc budget spend jente                 # current spend
```

When an assistant reaches its limit, further LLM calls are stopped until the budget
resets or you raise it.

## Choose your model provider

You're not locked to one vendor. Manage the LLM (and storage/secret) providers your
fleet uses:

```bash
oc providers list
oc providers set <provider> -f provider.yaml
```

Use Claude, GPT, or open-source models — and switch without changing anything about
your assistants or skills.

## See utilisation

```bash
oc metrics server      # overall control-plane utilisation snapshot
```

Spend and budget changes are recorded in the [audit log](/guide/audit).
