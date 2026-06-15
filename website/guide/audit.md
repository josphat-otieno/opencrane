# Audit log

Every administrative change — creating or suspending tenants, editing policies,
publishing skills, registering tools, changing budgets — is recorded in a queryable
audit log.

## Query the log

```bash
oc audit list                          # most recent activity
oc audit list --tenant jente           # everything for one assistant
oc audit list --tenant jente --limit 50
```

Use `--output json` for machine-readable output you can pipe into other tools:

```bash
oc audit list --output json | jq '.[] | {time, actor, action}'
```

## What's recorded

Changes are dual-written to Kubernetes (the source of truth) and to a database for
fast querying, so the log stays accurate even if one path is unavailable. Note that
OpenCrane records **administrative actions** — it does **not** log the contents of
anyone's conversations with their assistant.
