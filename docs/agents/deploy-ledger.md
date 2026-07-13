# Deploy ledger — the fleet's memory

Append-only log of deploy runs and what they taught us. The `deploy` agent reads this
**before every run** (so no lesson is rediscovered) and appends after every run. The
`/deploy-loop` skill mines it for configuration-simplification candidates: any friction
item seen in **2+ runs** graduates to a fix PR or an issue.

Keep entries terse — this file is loaded into agent context every run. When a lesson is
fixed at the source (chart/script/docs), rewrite its line to a one-line pointer
(`fixed → PR #NNN`) instead of letting dead advice accumulate. Full run reports do NOT
belong here; they live in the run's PR/issue.

## Format (append one block per run)

```
## <date> · <env> · <profile> · <sha> · <LIVE|PARTIAL|FAILED>
- findings: <class>: one line each, with PR/issue link once filed
- friction: one line each (these accumulate into simplification counters)
- lesson: what the next run must know (flags, ordering, gotchas)
```

## Simplification counters

Friction items seen across runs; bump the count, and when it hits 2, file the fix.

| Friction item | Seen | Status |
|---|---|---|
| No raw-helm-flag passthrough in `k8s-deploy.sh` (blocks sanctioned `--take-ownership` / one-time field-clear recoveries) | 3 (07-09, 07-11, 07-12) | **fix in flight** — `--helm-arg` passthrough in the script-hardening PR |
| `--preflight` NS-delegation check false-positives on `dev.opencrane.ai` every run (A-record in parent zone, not a delegated subzone) | 3+ (07-10..07-12) | **graduated** — scope the check to only fire when ACME/DNS-01 issuance is requested |
| `--set` numeric-string coercion breaks string values (annotations) — needs `--set-string`/`--values` | 2 (07-10, 07-11) | fixed-forward in usage; consider a script guard |

## Standing lessons (read these first)

- Dependencies resolve from `Chart.lock` via `helm dep build` — never `dep update`
  during a deploy (reproducibility; see PR #97).
- Values presets live in `libs/k8s-platform/values/` (`opencrane-dev.yaml` is the dev
  cluster). New env knobs belong in a preset, not in one-off `--set` flags.
- Known dev-cluster history (see auto-memory / plan.md): migrate-on-deploy
  initContainer, tenant-pod `trustNothing` config crash, `trustedProxies: []`
  fail-closed — check whether a "new" failure is one of these before diagnosing fresh.
- **In-place upgrade ≠ fresh render.** A chart change to an immutable/API-defaulted
  field (Deployment `strategy`/`selector`, PVC spec, Service `clusterIP`) or a resource's
  Helm-ownership metadata can be rejected by `helm upgrade` on an already-live object even
  when `helm template`/CI are green. Diff `helm get manifest` / the live object before
  applying. Two burns: RollingUpdate→Recreate needing `rollingUpdate: null` then
  ultimately `maxSurge:0` (PRs #187→#188→#189, 3 revisions); Certificate created
  out-of-band failing "cannot be imported into the current release" (2026-07-09).
- `--set` coerces a numeric-looking string to a number (e.g. a `restartedAt` epoch
  annotation → `expected string, got 1783…`). Use `--set-string` or a `--values` file
  with a quoted value for annotation/string values.
- A service that stores state (Cognee: identity DB + graph + vector) needs a PVC, or it
  wipes on every restart — and any operator-registered state inside it (per-tenant logins)
  is orphaned with it. Boot-time provisioning of such state must reconcile on a loop, not
  one-shot; and a tenant pod that reads its credentials via `secretKeyRef` needs a
  pod-template stamp to roll when that state is re-provisioned (PR #187→#190).

## Runs

## 2026-07-08 · dev · deploy-org-frontend (control-plane SPA) · fff20c16c3f3 · LIVE
- findings: none — clean rollout, all 3 orgs (elewa, northwind, elewa-be) healthy
- friction: deploy-org-frontend.sh is not one of the two mandated profile scripts
  (apps/fleet-platform|clustertenant-platform/deploy.sh) but is the repo's dedicated,
  ledger-documented path for this exact surface — mandate doc should list it explicitly
  alongside the two profile scripts to avoid re-litigating this each run
- lesson: all 3 orgs already had ingress.sameOrigin chart-owned rules (no legacy
  out-of-band ingress patch needed) — confirms the migration from optimalisation-plan.md
  §5 is complete in dev; script's legacy-patch fallback branch is now dead code for
  these orgs and can likely be dropped/flagged once confirmed elsewhere too

## 2026-07-09 · dev · clustertenant-platform (silo: elewa/elewa-be/northwind) · 7a61226 · PARTIAL
- findings: infra: elewa-be + northwind upgrades FAIL outright — `Certificate
  opencrane-clustertenant-tls` in both namespaces exists without Helm ownership
  metadata (created out-of-band 2026-06-29, same minute as elewa's own Helm-owned
  copy); every `helm upgrade` since errors "cannot be imported into the current
  release". Last successful upgrade for both was 2026-07-02 — this has silently
  blocked ~a week of deploys. Fix needs adoption (label/annotate to match elewa's
  metadata, or `helm upgrade --take-ownership` — client is v4.1.4, supports it) but
  k8s-deploy.sh has no raw-helm-flag passthrough to do this through the script.
- findings: codebase: `apps/tenant/deploy/entrypoint.sh` only checks whether the
  OpenClaw binary EXISTS on the PVC before installing — never compares the installed
  `package.json` version to `$OPENCLAW_VERSION`. Result: bumping the pin (2026.6.9 →
  2026.6.11) does NOT upgrade an already-provisioned tenant; elewa's tenant pod
  restarted with `OPENCLAW_VERSION=2026.6.11` in env but is still running openclaw
  2026.6.9 (`cat .../node_modules/openclaw/package.json` confirms). `gateway.reload:
  hot` IS correctly rendered into the ConfigMap by the new control-plane, but its
  effect on an unsupported old binary is unverified.
- findings: script: `--tenant-tag` sets `tenant.image.tag`, a Helm value NO template
  reads. The tenant image is actually pinned via `tenant.defaultImage.tag` (read into
  `TENANT_DEFAULT_IMAGE`), which has no deploy flag and stays on floating `latest`.
  Worked out this run only because `latest` and `sha-7a61226` happen to share a
  digest (docker.yml pushes both on main-merge) + tenant pods use
  `imagePullPolicy: Always`.
- findings: codebase: elewa's `clustertenant-manager` fell into a tight, unthrottled
  reconcile loop after the rolling restart — "reconciling tenant" → "litellm key
  update failed ... Team=elewa" (404) → repeat every ~0.6–1.3s, sustained 10+ min,
  ~282m CPU. Tenant CR settles at `phase=Running` (litellm-key failure is caught and
  tolerated), so the generation/checksum skip-guard in `operator.ts` should apply but
  visibly isn't stopping the loop — needs an operator-side trace with debug logging.
  Likely related to the documented degraded-retry self-heal path having no backoff.
- findings: codebase (minor): tenant pod's 30s contract-re-pull loop
  (`entrypoint.sh:386`) shells out to `curl`, which isn't installed in the
  `node:22-bookworm-slim` runtime stage — every cycle fails
  "curl: command not found"; the contract re-pull feature is a no-op fleet-wide.
- friction: no raw-helm-flag passthrough in k8s-deploy.sh — a sanctioned, non-destructive
  recovery (`--take-ownership`) exists in the installed Helm client but the script can't
  reach it, so an out-of-band-drifted resource permanently blocks scripted deploys.
- friction: `--tenant-tag` is a documented, plausible-looking flag that is dead code
  (2nd distinct "flag looks wired but isn't" finding after the deploy-org-frontend
  mandate-doc gap on 2026-07-08 — different flags, same pattern: worth a lint/test that
  every declared `--set` target actually resolves against `helm template`).
- lesson: before touching elewa-be/northwind again, check every CR the silo chart
  renders (`Certificate`, `Issuer`, etc.) for `app.kubernetes.io/managed-by: Helm` +
  `meta.helm.sh/release-name`/`release-namespace` annotations matching this release —
  a mismatch fails the upgrade before anything else runs, and looks nothing like the
  documented NS-delegation preflight false positive.
- lesson: a successful `helm upgrade` + "successfully rolled out" is NOT proof the
  intended runtime change took effect inside the tenant pod — verify the actual
  installed package version on the PVC, not just the pod's env vars/ConfigMap.

## 2026-07-10 · dev · clustertenant-platform (silo: elewa) · e974df3 → 014250f → 1418d70 · LIVE
- context: Cognee org-memory fix chain (issues behind PRs #178/#182/#183/#184). Multiple
  same-day silo redeploys as each layer landed.
- findings: infra: opencrane-dev has NO NetworkPolicy-enforcing CNI (standard GKE, no
  Dataplane V2, `networkPolicy: null`, no calico/cilium DaemonSet) — every silo/Cognee
  NetworkPolicy is declared-but-INERT, incl. the #178 Cognee egress exclusion. Filed #180.
- findings: codebase: Cognee had no LLM/embedding creds, then no registered embedding
  model, then a shared-`default_user` login — fixed across #182/#183/#184 (per-tenant
  Cognee logins keyed to the IdP email + a shared silo Cognee tenant + an `auto-embedding`
  alias). Verified live: `/v1/embeddings` model=auto-embedding → 200, no more
  `Invalid model name` / `EmbeddingException`.
- lesson: LiteLLM `/model/new` is not idempotent by name — guard with a `/model/info`
  check (the embedding path does; chat guards via the ModelDefinition row). Registry
  stayed duplicate-free across many redeploys.

## 2026-07-11 · dev · clustertenant-platform (silo: elewa) · 8905cdc / 53a64f9 · FAILED ×2
- findings: chart: Cognee had NO persistent storage — identity DB + graph + vector on the
  pod's ephemeral fs, wiped every restart (the #184 restart orphaned the per-tenant login →
  `qa store failed: 401`). Fixed by a PVC (#187). BUT #187/#188 used `type: Recreate`, which
  the API server rejected on the already-live Deployment (`spec.strategy.rollingUpdate:
  Forbidden`) — `helm upgrade` aborted at rev 32 AND rev 33, so Cognee never got the PVC. A
  template `rollingUpdate: null` (#188) did not clear the field via Helm's 3-way merge.
- lesson: see standing lesson "in-place upgrade ≠ fresh render". Superseded by #189's
  `RollingUpdate maxSurge:0` (RWO-safe, no strategy-type transition).

## 2026-07-12 · dev · clustertenant-platform (silo: elewa) · 584bd3c → 830f42e · LIVE
- findings: chart: #189 (`RollingUpdate maxSurge:0`) applies cleanly on the live Deployment;
  Cognee PVC Bound, and data VERIFIED to survive a forced restart (same PVC re-attached,
  db mtimes pre-date the restart; transient Multi-Attach self-resolves in ~15s — the
  RWO-safe handoff working as designed).
- findings: codebase: the silo-owner self-heal (`ensureSiloTenant`) was one-shot at operator
  boot with no retry — it missed the Cognee readiness window on a deploy, so the persistent
  Cognee stayed owner-less and every per-tenant join looped on owner-login 400s. And the
  running tenant pod (secretKeyRef creds, no re-login on 401) never picked up a healed
  identity. Both fixed in #190: periodic 60s silo heal + an `opencrane.io/cognee-identity`
  pod-template stamp that rolls the tenant pod when its Cognee tenant id changes. Verified
  live: owner re-provisioned within 14s of boot, tenant pod rolled, no 401 in the post-roll
  window, embedding 200.
- friction: `--preflight` NS-delegation check false-positives on dev.opencrane.ai (A-record
  in the parent zone, not a delegated subzone) on every run — candidate to scope the check
  to only fire when ACME/DNS-01 issuance is actually requested.
- lesson: org-memory is only "working" when the tenant pod can invoke it — a green rollout +
  healed server-side identity is necessary but not sufficient; confirm from the tenant pod's
  own logs (fresh login, no 401) after it rolls.

## 2026-07-12 · dev · fleet-platform + clustertenant-platform (elewa/elewa-be/northwind/tarv-org) · e149924 · PARTIAL
- findings: chart: `.Values.multiCt.enabled` (networkpolicy-main-network-baseline.yaml) nil-pointer-panics under `--reuse-values` — the key is a chart default added after the fleet's last release and `--reuse-values` doesn't re-merge new chart defaults; fix PR uses the nil-safe `(.Values.multiCt).enabled` idiom + drops `--reuse-values` from the dev preset header.
- findings: script: default `--reset-then-reuse-values` silently floated the pinned per-component image tag back to chart-default `latest` (digest-equal this run, no content risk) — re-pin explicitly every run until the tag-float guard PR lands.
- findings: chart/config: fresh silo (tarv-org) deterministically collides on the legacy cluster-wide wildcard gateway-ingress (`ingress.sameOrigin.enabled` defaulted false) → fixed → PR #199 removes the legacy wildcard entirely and makes same-origin the ONLY ingress mode (toggle deleted); re-deploy proves it + prunes the stale elewa-be/northwind wildcards once #201's --take-ownership lands.
- findings: infra: external-dns `--domain-filter=dev.opencrane.ai` never matches the actual zone (`opencrane.ai.`) — ALL org A-record writes silently dropped ≥2 days; tarv-org's DNSEndpoint never written → issue #198.
- findings: infra (bump): elewa-be + northwind Certificate-ownership block unchanged since 2026-07-02 (recovery unblocks once --helm-arg passthrough PR lands); codebase (bump): #174 litellm-key reconcile loop still reproducing on elewa.
- friction: fleet profile REQUIRES undocumented `OPENCRANE_SKIP_PREFLIGHT=1` on this cluster (header docs in the script-hardening PR); `--platform-operator-seed-email` must be restated every invocation (fail-closed gate — header callout in same PR).
- lesson: do NOT use `--reuse-values` on the fleet profile; use the script default AND restate `--control-plane-tag`/`--operator-tag` explicitly. npm/NX repo conversion (PR #196) is deploy-neutral: scripts build nothing; charts render identically.
