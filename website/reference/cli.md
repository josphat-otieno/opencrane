# OpenCrane CLI Reference

`oc` is the first-class command-line interface for the OpenCrane platform. Every administrative capability available through the API is reachable via `oc`.

---

## Installation

```bash
# From the monorepo
pnpm --filter @opencrane/cli build
node apps/cli/dist/index.js --help

# Or link globally after building
pnpm --filter @opencrane/cli build
npm link apps/cli
oc --help
```

---

## Global Options

These options apply to every command and can be set via environment variables.

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--url <url>` | `OPENCRANE_URL` | `http://localhost:8080` | Silo clustertenant-manager base URL — used by all tenant-facing commands |
| `--fleet-url <url>` | `OPENCRANE_FLEET_URL` | Falls back to `--url` | Fleet-manager base URL — used by fleet/admin commands (`oc cluster-tenant`, `oc admin`, `oc platform dns`) |
| `--token <token>` | `OPENCRANE_TOKEN` | — | Bearer token (break-glass / automation path) |
| `--output <format>` | — | `table` | Output format: `table` or `json` |

::: tip Fleet vs silo URLs
Commands that manage ClusterTenants, Zitadel admin, or platform DNS target the **fleet-manager** via `--fleet-url` / `OPENCRANE_FLEET_URL`. All other commands (tenants, policies, skills, budgets, etc.) target the per-silo **clustertenant-manager** via `--url` / `OPENCRANE_URL`. When no `--fleet-url` is configured the CLI falls back to `--url` — this works for co-located dev installations where both managers are accessible at the same host.
:::

**Authentication note:** Bearer token is the current automation path. OIDC is the planned human-operator path; see the `oc auth` commands. Projected ServiceAccount tokens will replace static bearer tokens once Kubernetes workload identity support lands.

---

## Command Groups

The commands below are grouped by which backend they target.

### Fleet commands (target `--fleet-url`)

These commands manage resources that live in the fleet-manager (`opencrane-system`). Set `OPENCRANE_FLEET_URL` or pass `--fleet-url <url>` to point at the fleet plane.

#### `oc cluster-tenant`

Manage ClusterTenants — the first-class customer and isolation unit.

```
oc cluster-tenant list                  List all cluster tenants
oc cluster-tenant show <name>           Show a cluster tenant by name
oc cluster-tenant create                Create a cluster tenant (reads JSON from stdin)
oc cluster-tenant update <name>         Update a cluster tenant (reads JSON from stdin)
oc cluster-tenant delete <name>         Delete a cluster tenant
oc cluster-tenant status <name>         Show provisioning status
oc cluster-tenant refresh <name>        Trigger a reconcile of the cluster tenant
```

Quota and compute flags accepted by `create` and `update`:

```
  --tier <tier>           Isolation tier: shared | dedicatedNodes | dedicatedCluster
  --compute <mode>        Compute mode: shared | dedicated
  --node-pool <pool>      Node pool name (required when --compute dedicated)
  --quota-cpu <qty>       CPU quota (e.g. 8)
  --quota-memory <qty>    Memory quota (e.g. 16Gi)
  --quota-pods <n>        Pod count quota
  --quota-storage <qty>   Storage quota (e.g. 100Gi)
  --quota-gpu <n>         GPU quota
```

Membership sub-commands:

```
oc cluster-tenant members list <name>           List org members
oc cluster-tenant members add <name>            Add a member (reads JSON from stdin)
oc cluster-tenant members remove <name>         Remove a member (reads JSON from stdin)
```

---

#### `oc admin`

Superadmin operations — gated to platform-operators on the fleet plane.

```
oc admin zitadel rotate-key             Rotate the platform Zitadel SA key
  --key-file <path>                     Read the candidate key from a file (preferred)
  --key <json>                          Inline key JSON (avoid in production)
```

The rotation validates the candidate key (JWT-bearer exchange + `IAM_OWNER` scope probe) before replacing the live key. The old key stays active until validation passes. See [Zitadel key rotation](/security/zitadel-key-rotation).

---

#### `oc platform dns`

Manage the platform wildcard-TLS DNS-01 ClusterIssuer — gated to platform-operators on the fleet plane.

```
oc platform dns show                    Show the configured DNS-01 ClusterIssuer
  --issuer-name <name>                  Inspect a specific ClusterIssuer by name

oc platform dns set                     Configure the DNS-01 ClusterIssuer
  --provider <provider>                 Solver provider (cloudflare | digitalocean | route53 | rfc2136 | …)
  --zone <zone>                         Base/delegated DNS zone (e.g. ai.example.com)
  --email <email>                       ACME account contact email
  --server <url>                        ACME directory URL (defaults to Let's Encrypt production)
  --token-file <path>                   Provider API token from file (never pass on the CLI directly)
  --issuer-name <name>                  ClusterIssuer name
  --solver-config-file <path>           Raw provider solver block as JSON file
```

---

### Silo commands (target `--url`)

These commands manage resources in a silo's clustertenant-manager. Set `OPENCRANE_URL` or pass `--url <url>` to point at the target silo.

### `oc tenants`

Manage tenant lifecycle.

```
oc tenants list                         List all tenants
oc tenants get <name>                   Get a tenant by name
oc tenants create                       Create a tenant (reads JSON from stdin)
oc tenants update <name>                Update a tenant (reads JSON from stdin)
oc tenants delete <name>                Delete a tenant
oc tenants suspend <name>               Suspend a tenant pod
oc tenants resume <name>                Resume a suspended tenant
oc tenants datasets get <name>          Get dataset memberships for a tenant
oc tenants datasets set <name>          Update dataset memberships (reads JSON from stdin)
oc tenants contract <name>              Print the compiled effective runtime contract
```

---

### `oc policies`

Manage AccessPolicy resources.

```
oc policies list                        List all access policies
oc policies get <name>                  Get a policy by name
oc policies create                      Create a policy (reads JSON from stdin)
oc policies update <name>               Update a policy (reads JSON from stdin)
oc policies delete <name>               Delete a policy
```

---

### `oc mcp`

Manage MCP server registrations.

```
oc mcp list                             List MCP servers
oc mcp get <id>                         Get an MCP server
oc mcp create                           Register an MCP server (reads JSON from stdin)
oc mcp update <id>                      Update an MCP server (reads JSON from stdin)
oc mcp delete <id>                      Delete an MCP server
```

---

### `oc skills`

Manage the skill catalogue.

```
oc skills list                          List skill bundles
oc skills get <id>                      Get a skill bundle
oc skills publish                       Publish a skill bundle (reads JSON from stdin)
oc skills update <id>                   Update a skill bundle (reads JSON from stdin)
oc skills delete <id>                   Remove a skill bundle
```

---

### `oc budget`

Inspect and manage AI budgets and LiteLLM virtual keys.

```
oc budget global get                    Get global budget settings
oc budget global set                    Update global budget settings (reads JSON from stdin)
oc budget accounts list                 List per-user account budgets
oc budget accounts set <userId>         Set a user account budget (reads JSON from stdin)
oc budget accounts delete <userId>      Remove a user account budget
oc budget spend <tenantName>            Show current spend for a tenant
oc budget key get <tenantName>          Get a tenant's LiteLLM virtual key
oc budget key revoke <tenantName>       Revoke a tenant's LiteLLM virtual key
```

---

### `oc audit`

Query the audit log.

```
oc audit list                           List audit log entries
  --tenant <name>                       Filter to a specific tenant
  --limit <n>                           Maximum entries (default 100)
  --cursor <cursor>                     Pagination cursor from a previous response
```

Outputs a cursor hint when more pages are available:
```
More results available. Next cursor: eyJ...
Run with --cursor eyJ... to fetch the next page.
```

---

### `oc tokens`

Manage access tokens.

```
oc tokens list                          List access tokens
oc tokens create                        Create an access token (reads JSON from stdin)
oc tokens delete <id>                   Revoke an access token
```

---

### `oc providers`

Manage provider API keys (e.g. OpenAI, Anthropic).

```
oc providers list                       List configured provider keys
oc providers set                        Set a provider key (reads JSON from stdin)
oc providers delete <provider>          Remove a provider key
```

---

### `oc metrics`

Inspect platform metrics.

```
oc metrics server                       Server health and aggregate platform metrics
oc metrics drift                        Projection drift counts, lag, and alert state
```

---

### `oc auth`

Manage session and OIDC authentication.

```
oc auth me                              Print the current session principal
oc auth logout                          End the current session
```

OIDC login is browser-initiated: open `<OPENCRANE_URL>/api/v1/auth/login` in a browser to start the flow and receive a session cookie.

---

## Output Formats

**Table** (default) — human-readable columns printed to stdout.

**JSON** — machine-readable output, suitable for piping to `jq`:

```bash
oc tenants list --output json | jq '.[].name'
oc audit list --output json --tenant acme | jq '.[].action'
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (API error, validation failure, or unexpected exception) |

All destructive commands (`delete`, `revoke`, `suspend`) are non-interactive and exit immediately. There are no confirmation prompts — suitable for scripting.

---

## Examples

```bash
# Provision a tenant
echo '{"name":"acme","email":"ops@acme.com","team":"platform"}' | oc tenants create

# Stream audit log across pages
cursor=""
while true; do
  out=$(oc audit list --limit 200 --cursor "$cursor" --output json)
  echo "$out" | jq '.[]'
  cursor=$(oc audit list --limit 200 --cursor "$cursor" | grep 'Next cursor:' | awk '{print $NF}')
  [ -z "$cursor" ] && break
done

# Check projection drift before a deploy
oc metrics drift --output json | jq '.tenants.mismatchCount'

# Revoke a key and verify it's gone
oc budget key revoke acme
oc budget key get acme   # should 404
```
