# DNS configuration

This is the operator-facing companion to **[Set up your domain](/guide/dns)**. The guide
walks an admin through the happy path; this page documents the model, the full API/CLI
surface, the cert-manager resources OpenCrane creates, and the per-provider and
multi-instance options.

## The model: one fixed platform wildcard, orgs and users derived under it

::: info Current model — being superseded by the identity-routing proxy
The per-user-subdomain topology on this page (`<user>.<org>.<base>`) is the **current**
implementation and is what an operator configures today. The decided direction collapses
every user in an org onto the org's **single host** `<org>.<base>`: an in-cluster
identity-routing proxy authenticates the session and routes each user to their own gateway,
so there are **no per-user subdomains**. Under that model the **second wildcard level**
(`*.<org>.<base>`) and its DNS-01 wildcard certificate are unnecessary — an org needs only
`<org>.<base>` (one record + an HTTP-01 certificate). Until the proxy ships, the model below
applies.
:::

OpenCrane uses a **fixed wildcard topology**. The platform owns **one base domain**
(`<base>`, e.g. `weownai.eu`) and a **fixed super-operator / control-plane host**
(`platform.<base>`). Every org and user name is **derived** under the base — customers do
not bring their own domain:

| Name | Where it points | Set how often |
|------|-----------------|---------------|
| Control-plane host `platform.<base>` → ingress | platform DNS | once, at install |
| Apex `<base>` → ingress | platform DNS | once, at install |
| Platform wildcard `*.<base>` → ingress (resolves every **org apex** `<org>.<base>`) | platform DNS | once, at install |
| Per-org wildcard `*.<org>.<base>` → ingress (resolves every **user** `<user>.<org>.<base>`) | platform DNS | automatic, per org at provision time |
| New user `alice.<org>.<base>` resolves **and** gets HTTPS | — | automatic, zero touch |

So an org is served at `<org>.<base>` (e.g. `acme.weownai.eu`) and — **in the current
model** (see the note above) — its users at `<user>.<org>.<base>` (e.g.
`mike.acme.weownai.eu`); the identity-routing proxy will instead serve them through the org's
own host `<org>.<base>`.

### Why two wildcard levels

A DNS wildcard matches **exactly one label**. `*.<base>` resolves every org apex
`<org>.<base>`, but it does **not** reach the extra label in `<user>.<org>.<base>`. So each
org gets its **own** wildcard `*.<org>.<base>` (record + certificate), created when the org
is provisioned. Once an org exists, every user under it resolves and gets HTTPS the moment
they are created — no per-user record. All names land on the same ingress; the ingress
controller routes by the HTTP `Host:` header to the right gateway.

### Who writes the records: external-dns (runtime substrate)

The platform records (`platform.<base>`, the apex, and the platform wildcard `*.<base>`)
are written **once at install** — by Terraform when it owns the Cloud DNS zone, or by you
at your provider otherwise. Everything **per-org** is written at **runtime** by the
in-cluster **external-dns** controller: the cluster-tenants operator declares each org's
records as a namespaced `DNSEndpoint` custom resource
(`externaldns.k8s.io/v1alpha1`), and external-dns (run with `--source=crd`) reconciles
those into the zone — adding records when an org is provisioned and reaping them when the
`DNSEndpoint` (or its namespace) is deleted. The operator therefore talks to **no cloud
DNS API directly**; the record substrate is provider-agnostic. The install scripts bundle
external-dns as a cluster singleton in `acme`/`clouddns` mode (`--no-external-dns` to BYO a
controller); the `externalDns.enabled` chart value gates the operator's `DNSEndpoint` RBAC.

### The shared zone-write identity

external-dns (writing records) and the cert-manager DNS-01 solver (writing the temporary
`_acme-challenge` `TXT` records below) both need **write** access to the same zone, so they
**share one credential** — there is exactly one binding, never a per-controller copy:

- **Google Cloud, Workload Identity (default):** one Google service account bound
  `roles/dns.admin` on the zone's project, impersonated by both controllers'
  Kubernetes service accounts. Terraform's `dns` module provisions it.
- **External zone:** hand the same service-account key to both controllers via
  `--dns01-credentials` at install.

### Registrar NS-delegation (one-time)

When Terraform owns the Cloud DNS zone, delegate your domain to that zone's name servers
(the `dns_name_servers` Terraform output) at your **registrar** — an NS delegation. Until
that resolves, both DNS-01 issuance and external-dns reconciliation will hang. The
`./platform/k8s-deploy.sh --preflight` check verifies the delegation resolves before you
install.

### Why a provider token is still needed

Wildcards solve **routing**; HTTPS needs a certificate valid for the name in the browser.
OpenCrane issues wildcard certificates via Let's Encrypt — the **platform** cert
(`*.<base>` + apex + control-plane host) and, per org, a `*.<org>.<base>` cert. A wildcard
certificate can only be validated with the **ACME DNS-01 challenge** — cert-manager briefly
creates a `_acme-challenge.<zone>` `TXT` record. The provider token you supply is used for
**exactly that, and only that**: writing and removing that temporary validation record.
cert-manager then auto-renews (~every 60 days) using the same token.

### Optional: a customer-vanity domain (CNAME)

A customer who wants their **own** domain (e.g. `ai.client-company.com`) does **not**
delegate or transfer it — they add a single `CNAME` at their own provider pointing it at
their org apex:

```
# At the customer's DNS provider, for org "acme" on base "weownai.eu":
ai.client-company.com.   CNAME   acme.weownai.eu.
```

Then set the org's `vanityDomain` (`oc cluster-tenant update acme --vanity-domain
ai.client-company.com`, or the `vanityDomain` field on the API). OpenCrane adds the vanity
name to the org's TLS SANs so it is browser-trusted. The vanity domain is an **overlay**:
the org is always also reachable at its canonical `<org>.<base>` apex.

## Configure it

### CLI

```bash
oc platform dns set \
  --provider cloudflare \
  --zone ai.example.com \
  --email you@example.com \
  --token-file ./cloudflare-token.txt
```

| Flag | Required | Meaning |
|------|----------|---------|
| `--provider` | yes | DNS-01 solver provider key (`cloudflare`, `digitalocean`, `route53`, `rfc2136`, …) |
| `--zone` | yes | The platform wildcard **base** the certs cover (e.g. `weownai.eu`) — orgs are `<org>.<base>`, users `<user>.<org>.<base>` |
| `--email` | yes | ACME account contact address (renewal notices) |
| `--server` | no | ACME directory URL (defaults to Let's Encrypt production) |
| `--issuer-name` | no | Issuer name to create/update (defaults to `opencrane-issuer`) |
| `--token-file` | no | File holding the provider API token, for token-based providers |
| `--solver-config-file` | no | JSON file with a raw provider solver block, for non-token providers |

The token and solver config are read from **files**, never passed as arguments, so
secrets never land in shell history or process listings.

Inspect the current configuration at any time:

```bash
oc platform dns show
```

### Providers

| Provider | Credential | How to supply |
|----------|-----------|---------------|
| `cloudflare` | scoped API token | `--token-file` |
| `digitalocean` | API token | `--token-file` |
| `route53` | IAM keys / role | `--solver-config-file` |
| `rfc2136` | TSIG key | `--solver-config-file` |

Token-based providers (`cloudflare`, `digitalocean`) store the token in a Secret the
solver references. Any other provider supplies its solver block verbatim via
`--solver-config-file` — a JSON object rendered under the provider key. For example, an
`rfc2136` solver config:

```json
{
  "nameserver": "10.0.0.53:53",
  "tsigKeyName": "opencrane-key",
  "tsigAlgorithm": "HMACSHA256",
  "tsigSecretSecretRef": { "name": "rfc2136-tsig", "key": "tsig-secret" }
}
```

The token must be scoped to **edit the delegated zone only** — DNS-01 needs nothing more
than creating and removing `TXT` records in that zone.

## API surface

The CLI is a thin client over a platform-admin endpoint mounted at
`/api/v1/platform/dns` (behind the auth middleware). It is API-first: the CLI is one
client, not a privileged path.

### `PUT /api/v1/platform/dns`

Capture a provider config and apply the cert-manager issuer (+ credentials Secret).

```json
{
  "provider": "cloudflare",
  "zone": "ai.example.com",
  "email": "you@example.com",
  "server": null,
  "issuerName": "opencrane-issuer",
  "apiToken": "<token>",
  "solverConfig": null
}
```

`provider`, `zone` and `email` are required. On success it returns the applied summary:

```json
{
  "status": "configured",
  "issuerName": "opencrane-issuer",
  "issuerKind": "ClusterIssuer",
  "issuerNamespace": null,
  "provider": "cloudflare",
  "zone": "ai.example.com",
  "secretName": "opencrane-dns01-cloudflare"
}
```

| Status | When |
|--------|------|
| `400` `VALIDATION_ERROR` | `provider`, `zone` or `email` missing |
| `422` `DNS_PROVIDER_MISCONFIGURED` | token-based provider with no token, or non-token provider with no solver block |

### `GET /api/v1/platform/dns`

Report the configured issuer (non-secret fields only). Optional `issuerName` query
parameter selects which issuer to inspect.

```json
{
  "configured": true,
  "issuerName": "opencrane-issuer",
  "issuerKind": "ClusterIssuer",
  "issuerNamespace": null,
  "provider": "cloudflare",
  "email": "you@example.com",
  "server": "https://acme-v02.api.letsencrypt.org/directory"
}
```

When no issuer exists (or the cert-manager CRDs are not installed) it returns
`configured: false`. Auth and permission errors are **not** masked as unconfigured — only
a genuine 404 reports `configured: false`.

## What gets created in the cluster

`PUT` idempotently upserts two resources (create, or replace on conflict, so a rotated
token takes effect on re-apply):

1. **A credentials Secret** — `opencrane-dns01-<provider>` (token-based providers only),
   holding the provider token under the `api-token` key.
2. **A cert-manager issuer** — an ACME DNS-01 issuer referencing that Secret (or the raw
   solver block). cert-manager then issues/renews the **platform** wildcard `*.<base>`
   certificate (plus the apex and the control-plane host) into the Secret the chart
   references (`ingress.tls.secretName`, default `opencrane-wildcard-tls`).

This authorises the issuer **on the zone**. Per **org** the cluster-tenants operator then
issues a `*.<org>.<base>` certificate at provision time, reusing the same issuer/token (see
[Why two wildcard levels](#why-two-wildcard-levels) above and
`platform/helm/examples/per-org-wildcard-cert.yaml`). The certificate appearing in a Secret
happens on a live cluster with real DNS; this endpoint's job is to author and apply the
issuer + Secret correctly.

## Issuer kind: single vs multi-instance

The issuer kind is environment-driven, so the same code serves a single install and
multiple instances sharing one cluster:

| Env var | Default | Effect |
|---------|---------|--------|
| `PLATFORM_DNS_ISSUER_KIND` | `ClusterIssuer` | `ClusterIssuer` = one cluster-wide issuer (solver Secret in the cert-manager namespace). `Issuer` = a per-instance namespaced issuer, so two instances never fight over one cluster-singleton. |
| `PLATFORM_DNS_ISSUER_NAMESPACE` | the pod's `NAMESPACE` | Namespace for a namespaced `Issuer` and its solver Secret (ignored for `ClusterIssuer`). |
| `CERT_MANAGER_NAMESPACE` | `cert-manager` | Namespace a cluster-wide `ClusterIssuer`'s solver Secret is written to. |

In multi-instance mode the Helm chart wires `PLATFORM_DNS_ISSUER_KIND=Issuer`. See
[Running multiple instances](/advanced/multi-instance).

## Local and dev installs

On a laptop install you can skip all of this — local mode does not need real DNS or public
certificates, and dev uses `sslip.io`-style hosts that resolve without a provider.

## See also

- [Set up your domain](/guide/dns) — the step-by-step admin walkthrough
- [Hosting & deployment](/operators/hosting) — ingress class, providers, the external-dns decision
- [Running multiple instances](/advanced/multi-instance) — namespaced issuers
- [CLI reference](/reference/cli) · [API overview](/reference/api-overview)
